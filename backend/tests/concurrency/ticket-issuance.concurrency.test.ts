import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { TicketService } from '../../src/modules/tickets/ticket.service.js';

const concurrency = Number(process.env.TICKETGUARD_CONCURRENCY ?? 20);

describe('real PostgreSQL ticket issuance concurrency', () => {
  jest.setTimeout(60_000);

  test('never oversells a one-ticket inventory under concurrent requests', async () => {
    const suffix = randomUUID();
    const passwordHash = 'integration-only';
    const owner = await prisma.user.create({ data: { email: `owner-${suffix}@test.local`, passwordHash, firstName: 'Owner', lastName: 'Test' } });
    const organizer = await prisma.user.create({ data: { email: `org-${suffix}@test.local`, passwordHash, firstName: 'Org', lastName: 'Test', role: 'EVENT_ORGANIZER' } });
    const event = await prisma.event.create({ data: { name: `Concurrency ${suffix}`, venue: { create: { name: 'Test', address: 'Test', city: 'Test', country: 'IN' } }, startAt: new Date(Date.now() + 3_600_000), endAt: new Date(Date.now() + 7_200_000), timezone: 'UTC', capacity: 1, status: 'PUBLISHED', organizer: { connect: { id: organizer.id } } } });
    const type = await prisma.ticketType.create({ data: { eventId: event.id, name: 'GENERAL', price: 1, currency: 'INR', quantity: 1 } });

    const results = await Promise.allSettled(Array.from({ length: concurrency }, (_, i) =>
      TicketService.issue(organizer.id, event.id, { ticketTypeId: type.id, ownerId: owner.id, quantity: 1 }, `concurrency-${suffix}-${i}`)
    ));
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const finalType = await prisma.ticketType.findUnique({ where: { id: type.id } });
    const issued = await prisma.ticket.count({ where: { eventId: event.id } });

    expect(succeeded).toHaveLength(1);
    expect(finalType?.soldCount).toBe(1);
    expect(issued).toBe(1);

    await prisma.ticketCredential.deleteMany({ where: { ticket: { eventId: event.id } } });
    await prisma.ticket.deleteMany({ where: { eventId: event.id } });
    await prisma.ticketType.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, organizer.id] } } });
  });
});
