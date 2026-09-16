import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { TicketCredentialService } from '../../src/modules/tickets/ticket-credential.service.js';
import { VerificationService } from '../../src/modules/verification/verification.service.js';
import { TransferService } from '../../src/modules/transfers/transfer.service.js';
import { TicketService } from '../../src/modules/tickets/ticket.service.js';

jest.setTimeout(30_000);

describe('TicketGuard concurrency invariants', () => {
  const ids: string[] = [];
  let scannerId = '';
  let ownerId = '';
  let recipientId = '';
  let eventId = '';
  let credential = '';
  let ticketId = '';

  beforeAll(async () => {
    const passwordHash = await argon2.hash('Concurrency-Test-2026!', { type: argon2.argon2id });
    const suffix = randomUUID().slice(0, 8);
    const [owner, recipient, scanner, organizer] = await Promise.all([
      prisma.user.create({ data: { email: `owner-${suffix}@concurrency.local`, passwordHash, firstName: 'Owner', lastName: 'Concurrency' } }),
      prisma.user.create({ data: { email: `recipient-${suffix}@concurrency.local`, passwordHash, firstName: 'Recipient', lastName: 'Concurrency' } }),
      prisma.user.create({ data: { email: `scanner-${suffix}@concurrency.local`, passwordHash, firstName: 'Scanner', lastName: 'Concurrency', role: 'SCANNER' } }),
      prisma.user.create({ data: { email: `organizer-${suffix}@concurrency.local`, passwordHash, firstName: 'Organizer', lastName: 'Concurrency', role: 'EVENT_ORGANIZER' } })
    ]);
    ids.push(owner.id, recipient.id, scanner.id, organizer.id); ownerId = owner.id; recipientId = recipient.id; scannerId = scanner.id;
    const event = await prisma.event.create({ data: { name: `Concurrency ${suffix}`, venue: { create: { name: 'Concurrency Venue', address: 'Test', city: 'Ghaziabad', country: 'India' } }, startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 3_600_000), timezone: 'Asia/Kolkata', capacity: 2, status: 'PUBLISHED', organizer: { connect: { id: organizer.id } } } });
    eventId = event.id;
    const type = await prisma.ticketType.create({ data: { eventId, name: 'GENERAL', price: 1, currency: 'INR', quantity: 2 } });
    await prisma.scannerAssignment.create({ data: { userId: scanner.id, eventId } });
    const ticket = await prisma.ticket.create({ data: { eventId, ticketTypeId: type.id, ownerId: owner.id, ticketNumber: `TG-CONC-${suffix}`, status: 'ACTIVE' } });
    ticketId = ticket.id;
    const c = TicketCredentialService.create(); credential = c.payload;
    await prisma.ticketCredential.create({ data: { ticketId, identifier: c.identifier, secretHash: c.secretHash, secretCiphertext: c.secretCiphertext } });
  });

  afterAll(async () => {
    await prisma.transferRecipient.deleteMany({ where: { transfer: { ticket: { eventId } } } });
    await prisma.transfer.deleteMany({ where: { ticket: { eventId } } });
    await prisma.ticketCredential.deleteMany({ where: { ticket: { eventId } } });
    await prisma.ticket.deleteMany({ where: { eventId } });
    await prisma.scannerAssignment.deleteMany({ where: { eventId } });
    await prisma.ticketType.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.venue.deleteMany({ where: { events: { none: {} } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  test('20 simultaneous scans produce exactly one successful check-in', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => VerificationService.verify(scannerId, credential, `concurrency-${i}`)));
    const successes = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { status: true } })).toEqual({ status: 'USED' });
  });

  test('concurrent issuance with one ticket-type unit remaining creates exactly one ticket', async () => {
    const type = await prisma.ticketType.create({ data: { eventId, name: 'LIMITED', price: 2, currency: 'INR', quantity: 1 } });
    const organizerId = (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { createdBy: true } })).createdBy;
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      TicketService.issue(organizerId, eventId, { ticketTypeId: type.id, ownerId, quantity: 1 }, `issue-${i}`)
    ));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.ticket.count({ where: { ticketTypeId: type.id } })).toBe(1);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: type.id }, select: { soldCount: true } })).soldCount).toBe(1);
  });

  test('concurrent issuance cannot exceed event capacity', async () => {
    const constrainedEvent = await prisma.event.create({ data: { name: `Capacity ${randomUUID().slice(0, 8)}`, venue: { create: { name: 'Capacity Venue', address: 'Test', city: 'Ghaziabad', country: 'India' } }, startAt: new Date(Date.now() + 60_000), endAt: new Date(Date.now() + 3_600_000), timezone: 'Asia/Kolkata', capacity: 1, status: 'PUBLISHED', organizer: { connect: { id: (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { createdBy: true } })).createdBy } } } });
    const type = await prisma.ticketType.create({ data: { eventId: constrainedEvent.id, name: 'CAPACITY', price: 3, currency: 'INR', quantity: 10 } });
    const organizerId = constrainedEvent.createdBy;
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      TicketService.issue(organizerId, constrainedEvent.id, { ticketTypeId: type.id, ownerId, quantity: 1 }, `capacity-${i}`)
    ));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.ticket.count({ where: { eventId: constrainedEvent.id } })).toBe(1);
    await prisma.ticket.deleteMany({ where: { eventId: constrainedEvent.id } });
    await prisma.ticketType.deleteMany({ where: { eventId: constrainedEvent.id } });
    await prisma.venue.deleteMany({ where: { id: constrainedEvent.venueId } });
    await prisma.event.delete({ where: { id: constrainedEvent.id } });
  });

  test('concurrent acceptance of the same transfer completes exactly once', async () => {
    const fresh = await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'ACTIVE', usedAt: null } });
    expect(fresh.status).toBe('ACTIVE');
    const transfer = await TransferService.create(ownerId, ticketId, (await prisma.user.findUniqueOrThrow({ where: { id: recipientId }, select: { email: true } })).email, 'accept-seed');
    const results = await Promise.allSettled([
      TransferService.accept(recipientId, transfer.id, 'accept-a'),
      TransferService.accept(recipientId, transfer.id, 'accept-b')
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.transfer.findUniqueOrThrow({ where: { id: transfer.id }, select: { status: true } })).toEqual({ status: 'ACCEPTED' });
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { ownerId: true, status: true } })).toEqual({ ownerId: recipientId, status: 'ACTIVE' });
  });

  test('failed credential rotation rolls back transfer ownership and state', async () => {
    const fresh = await prisma.ticket.update({ where: { id: ticketId }, data: { ownerId, status: 'ACTIVE', usedAt: null } });
    expect(fresh.ownerId).toBe(ownerId);
    const transfer = await TransferService.create(ownerId, ticketId, (await prisma.user.findUniqueOrThrow({ where: { id: recipientId }, select: { email: true } })).email, 'rollback-seed');
    const beforeCredentialCount = await prisma.ticketCredential.count({ where: { ticketId } });
    const original = TicketCredentialService.revokeAndCreate;
    TicketCredentialService.revokeAndCreate = async () => { throw new Error('injected credential failure'); };
    try {
      await expect(TransferService.accept(recipientId, transfer.id, 'rollback-test')).rejects.toThrow('injected credential failure');
    } finally {
      TicketCredentialService.revokeAndCreate = original;
    }
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { ownerId: true, status: true } })).toEqual({ ownerId, status: 'TRANSFER_PENDING' });
    expect(await prisma.transfer.findUniqueOrThrow({ where: { id: transfer.id }, select: { status: true } })).toEqual({ status: 'PENDING' });
    expect(await prisma.ticketCredential.count({ where: { ticketId } })).toBe(beforeCredentialCount);
  });

  test('concurrent transfer attempts on the same active ticket cannot both create pending transfers', async () => {
    const fresh = await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'ACTIVE', usedAt: null } });
    expect(fresh.status).toBe('ACTIVE');
    const [a, b] = await Promise.allSettled([
      TransferService.create(ownerId, ticketId, (await prisma.user.findUniqueOrThrow({ where: { id: recipientId }, select: { email: true } })).email, 'transfer-a'),
      TransferService.create(ownerId, ticketId, (await prisma.user.findUniqueOrThrow({ where: { id: recipientId }, select: { email: true } })).email, 'transfer-b')
    ]);
    expect([a, b].filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.transfer.count({ where: { ticketId, status: 'PENDING' } })).toBe(1);
  });
});
