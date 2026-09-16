import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { EventService } from '../../src/modules/events/event.service.js';
import { TicketService } from '../../src/modules/tickets/ticket.service.js';

describe('events, inventory and resource authorization against PostgreSQL', () => {
  const suffix = randomUUID();
  let organizerId: string; let otherOrganizerId: string; let ownerId: string; let eventId: string; let ticketTypeId: string;
  const passwordHash = 'integration-test-placeholder';
  const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  beforeAll(async () => {
    const users = await prisma.$transaction([
      prisma.user.create({ data: { email: `org-${suffix}@test.local`, passwordHash, firstName: 'Org', lastName: 'One', role: 'EVENT_ORGANIZER' } }),
      prisma.user.create({ data: { email: `other-${suffix}@test.local`, passwordHash, firstName: 'Org', lastName: 'Two', role: 'EVENT_ORGANIZER' } }),
      prisma.user.create({ data: { email: `owner-${suffix}@test.local`, passwordHash, firstName: 'Owner', lastName: 'One' } })
    ]);
    organizerId = users[0].id; otherOrganizerId = users[1].id; ownerId = users[2].id;
  });

  afterAll(async () => {
    if (!eventId) { await prisma.user.deleteMany({ where: { id: { in: [organizerId, otherOrganizerId, ownerId] } } }); await prisma.$disconnect(); return; }
    await prisma.ticketCredential.deleteMany({ where: { ticket: { eventId } } });
    await prisma.ticket.deleteMany({ where: { eventId } });
    await prisma.ticketType.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: { in: [organizerId, otherOrganizerId, ownerId] } } });
    await prisma.$disconnect();
  });

  test('organizer creates event, adds inventory, publishes and issues atomically', async () => {
    const event = await EventService.create(organizerId, { name: `Event ${suffix}`, description: 'integration', venue: { name: 'Venue', address: '1 Test St', city: 'Test City', country: 'IN' }, startAt: future(1), endAt: future(4), timezone: 'UTC', capacity: 2 }, `create-${suffix}`);
    eventId = event.id;
    const type = await EventService.createTicketType(organizerId, eventId, { name: 'GENERAL', price: 100, currency: 'INR', quantity: 2 }, `type-${suffix}`);
    ticketTypeId = type.id;
    await EventService.publish(organizerId, eventId, `publish-${suffix}`);
    const tickets = await TicketService.issue(organizerId, eventId, { ticketTypeId, ownerId, quantity: 2 }, `issue-${suffix}`);
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).not.toHaveProperty('credentialPayload');
    const persisted = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
    expect(persisted?.soldCount).toBe(2);
  });

  test('another organizer cannot manage the event', async () => {
    await expect(EventService.update(otherOrganizerId, eventId, { name: 'hijacked' }, `idor-${suffix}`)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('capacity and inventory cannot be exceeded', async () => {
    await expect(TicketService.issue(organizerId, eventId, { ticketTypeId, ownerId, quantity: 1 }, `overflow-${suffix}`)).rejects.toMatchObject({ code: 'EVENT_CAPACITY_EXCEEDED' });
    await expect(EventService.createTicketType(organizerId, eventId, { name: 'VIP', price: 100, currency: 'INR', quantity: 1 }, `overflow-type-${suffix}`)).rejects.toThrow();
  });
});
