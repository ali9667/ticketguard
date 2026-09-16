import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { app } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { TicketCredentialService } from '../../src/modules/tickets/ticket-credential.service.js';

describe('TicketGuard core integration', () => {
  const password = 'Integration-Test-2026!';
  let ownerId = '';
  let otherId = '';
  let organizerId = '';
  let scannerId = '';
  let ownerToken = '';
  let organizerToken = '';
  let ticketId = '';
  let credential = '';
  let eventId = '';

  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const suffix = randomUUID().slice(0, 8);
    const owner = await prisma.user.create({ data: { email: `owner-${suffix}@test.local`, passwordHash, firstName: 'Owner', lastName: 'Test' } });
    const other = await prisma.user.create({ data: { email: `other-${suffix}@test.local`, passwordHash, firstName: 'Other', lastName: 'Test' } });
    const organizer = await prisma.user.create({ data: { email: `organizer-${suffix}@test.local`, passwordHash, firstName: 'Organizer', lastName: 'Test', role: 'EVENT_ORGANIZER' } });
    const scanner = await prisma.user.create({ data: { email: `scanner-${suffix}@test.local`, passwordHash, firstName: 'Scanner', lastName: 'Test', role: 'SCANNER' } });
    ownerId = owner.id; otherId = other.id; organizerId = organizer.id; scannerId = scanner.id;

    const event = await prisma.event.create({ data: {
      name: `Integration ${suffix}`, venue: { create: { name: 'Test Venue', address: 'Test', city: 'Ghaziabad', country: 'India' } },
      startAt: new Date(Date.now() - 5 * 60 * 1000), endAt: new Date(Date.now() + 60 * 60 * 1000), timezone: 'Asia/Kolkata', capacity: 10, status: 'PUBLISHED', organizer: { connect: { id: organizerId } }
    } });
    eventId = event.id;
    const type = await prisma.ticketType.create({ data: { eventId, name: 'GENERAL', price: 100, currency: 'INR', quantity: 10 } });
    await prisma.scannerAssignment.create({ data: { userId: scannerId, eventId } });
    const ticket = await prisma.ticket.create({ data: { eventId, ticketTypeId: type.id, ownerId, ticketNumber: `TG-TEST-${suffix}`, status: 'ACTIVE' } });
    const createdCredential = TicketCredentialService.create();
    credential = createdCredential.payload;
    ticketId = ticket.id;
    await prisma.ticketCredential.create({ data: { ticketId, identifier: createdCredential.identifier, secretHash: createdCredential.secretHash, secretCiphertext: createdCredential.secretCiphertext } });
    await prisma.ticketType.update({ where: { id: type.id }, data: { soldCount: 1 } });
  });

  afterAll(async () => {
    await prisma.$transaction(async tx => {
      await tx.ticketCredential.deleteMany({ where: { ticketId } });
      await tx.ticket.deleteMany({ where: { id: ticketId } });
      await tx.scannerAssignment.deleteMany({ where: { eventId } });
      await tx.ticketType.deleteMany({ where: { eventId } });
      await tx.event.deleteMany({ where: { id: eventId } });
      await tx.venue.deleteMany({ where: { events: { none: {} } } });
      await tx.refreshToken.deleteMany({ where: { userId: { in: [ownerId, otherId, organizerId, scannerId] } } });
      await tx.user.deleteMany({ where: { id: { in: [ownerId, otherId, organizerId, scannerId] } } });
    });
    await prisma.$disconnect();
  });

  test('register and login return an access token and set refresh cookie', async () => {
    const suffix = randomUUID().slice(0, 8);
    const register = await request(app).post('/api/v1/auth/register').send({ email: `new-${suffix}@test.local`, password, firstName: 'New', lastName: 'User' });
    expect(register.status).toBe(201);
    expect(register.body.data.accessToken).toEqual(expect.any(String));
    expect(register.headers['set-cookie']?.[0]).toContain('ticketguard_refresh=');
  });

  test('IDOR is rejected', async () => {
    const owner = await request(app).post('/api/v1/auth/login').send({ email: (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).email, password });
    ownerToken = owner.body.data.accessToken;
    const response = await request(app).get(`/api/v1/tickets/${ticketId}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(response.status).toBe(200);
    const other = await request(app).post('/api/v1/auth/login').send({ email: (await prisma.user.findUniqueOrThrow({ where: { id: otherId } })).email, password });
    expect((await request(app).get(`/api/v1/tickets/${ticketId}`).set('Authorization', `Bearer ${other.body.data.accessToken}`)).status).toBe(403);
  });

  test('scanner can check in a valid ticket exactly once', async () => {
    const scanner = await request(app).post('/api/v1/auth/login').send({ email: (await prisma.user.findUniqueOrThrow({ where: { id: scannerId } })).email, password });
    const key = randomUUID();
    const first = await request(app).post('/api/v1/verification/ticket').set('Authorization', `Bearer ${scanner.body.data.accessToken}`).set('Idempotency-Key', key).send({ credential });
    expect(first.status).toBe(200);
    expect(first.body.data.result).toBe('VALID');
    const second = await request(app).post('/api/v1/verification/ticket').set('Authorization', `Bearer ${scanner.body.data.accessToken}`).set('Idempotency-Key', randomUUID()).send({ credential });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('TICKET_ALREADY_USED');
  });
});
