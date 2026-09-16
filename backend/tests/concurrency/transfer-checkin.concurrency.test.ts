import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { TicketCredentialService } from '../../src/modules/tickets/ticket-credential.service.js';
import { TransferService } from '../../src/modules/transfers/transfer.service.js';
import { VerificationService } from '../../src/modules/verification/verification.service.js';

describe('real PostgreSQL transfer and check-in concurrency', () => {
  jest.setTimeout(90_000);
  const suffix = randomUUID();
  const ids: string[] = [];
  const passwordHash = 'integration-test-placeholder';
  const makeUser = async (role: 'USER' | 'SCANNER' | 'EVENT_ORGANIZER' = 'USER') => {
    const user = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${randomUUID()}@test.local`, passwordHash, firstName: role, lastName: 'Test', role } });
    ids.push(user.id); return user;
  };

  afterAll(async () => {
    await prisma.transfer.deleteMany({ where: { OR: [{ initiatorId: { in: ids } }, { recipientId: { in: ids } }] } });
    await prisma.scannerAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.ticketCredential.deleteMany({ where: { ticket: { ownerId: { in: ids } } } });
    await prisma.ticket.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.event.deleteMany({ where: { createdBy: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  test('20 concurrent check-ins produce exactly one success', async () => {
    const owner = await makeUser(); const scanner = await makeUser('SCANNER'); const organizer = await makeUser('EVENT_ORGANIZER');
    const event = await prisma.event.create({ data: { name: `Check-in ${suffix}`, venue: { create: { name: 'Venue', address: 'Test', city: 'Test', country: 'IN' } }, startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 3_600_000), timezone: 'UTC', capacity: 1, status: 'PUBLISHED', organizer: { connect: { id: organizer.id } } } });
    const type = await prisma.ticketType.create({ data: { eventId: event.id, name: 'GENERAL', price: 1, currency: 'INR', quantity: 1, soldCount: 1 } });
    const ticket = await prisma.ticket.create({ data: { eventId: event.id, ticketTypeId: type.id, ownerId: owner.id, ticketNumber: `TG-${randomUUID()}`, status: 'ACTIVE' } });
    const credential = TicketCredentialService.create();
    await prisma.ticketCredential.create({ data: { ticketId: ticket.id, identifier: credential.identifier, secretHash: credential.secretHash, secretCiphertext: credential.secretCiphertext } });
    await prisma.scannerAssignment.create({ data: { userId: scanner.id, eventId: event.id } });

    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => VerificationService.verify(scanner.id, credential.payload, `scan-${suffix}-${i}`)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(19);
    expect(await prisma.ticket.count({ where: { id: ticket.id, status: 'USED' } })).toBe(1);
  });

  test('concurrent transfer creation serializes on the ticket', async () => {
    const owner = await makeUser(); const recipientA = await makeUser(); const recipientB = await makeUser(); const organizer = await makeUser('EVENT_ORGANIZER');
    const event = await prisma.event.create({ data: { name: `Transfer ${suffix}`, venue: { create: { name: 'Venue', address: 'Test', city: 'Test', country: 'IN' } }, startAt: new Date(Date.now() + 3_600_000), endAt: new Date(Date.now() + 7_200_000), timezone: 'UTC', capacity: 1, status: 'PUBLISHED', organizer: { connect: { id: organizer.id } } } });
    const type = await prisma.ticketType.create({ data: { eventId: event.id, name: 'GENERAL', price: 1, currency: 'INR', quantity: 1, soldCount: 1 } });
    const ticket = await prisma.ticket.create({ data: { eventId: event.id, ticketTypeId: type.id, ownerId: owner.id, ticketNumber: `TG-${randomUUID()}`, status: 'ACTIVE' } });
    const credential = TicketCredentialService.create();
    await prisma.ticketCredential.create({ data: { ticketId: ticket.id, identifier: credential.identifier, secretHash: credential.secretHash, secretCiphertext: credential.secretCiphertext } });

    const results = await Promise.allSettled([
      TransferService.create(owner.id, ticket.id, recipientA.email, `transfer-a-${suffix}`),
      TransferService.create(owner.id, ticket.id, recipientB.email, `transfer-b-${suffix}`)
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.transfer.count({ where: { ticketId: ticket.id, status: 'PENDING' } })).toBe(1);
  });
});
