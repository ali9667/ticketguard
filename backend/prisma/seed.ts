import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient, UserRole, EventStatus, TicketStatus } from '@prisma/client';
import { TicketCredentialService } from '../src/modules/tickets/ticket-credential.service.js';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('The development seed is disabled in production.');

  const passwordHash = await argon2.hash('TicketGuard-Local-2026!', { type: argon2.argon2id });
  const user = await prisma.user.upsert({ where: { email: 'user@ticketguard.local' }, update: {}, create: { email: 'user@ticketguard.local', passwordHash, firstName: 'Test', lastName: 'User', role: UserRole.USER } });
  const organizer = await prisma.user.upsert({ where: { email: 'organizer@ticketguard.local' }, update: {}, create: { email: 'organizer@ticketguard.local', passwordHash, firstName: 'Event', lastName: 'Organizer', role: UserRole.EVENT_ORGANIZER } });
  const scanner = await prisma.user.upsert({ where: { email: 'scanner@ticketguard.local' }, update: {}, create: { email: 'scanner@ticketguard.local', passwordHash, firstName: 'Entry', lastName: 'Scanner', role: UserRole.SCANNER } });
  await prisma.user.upsert({ where: { email: 'admin@ticketguard.local' }, update: {}, create: { email: 'admin@ticketguard.local', passwordHash, firstName: 'Platform', lastName: 'Admin', role: UserRole.ADMIN } });

  const existing = await prisma.event.findFirst({ where: { createdBy: organizer.id, name: 'TicketGuard Local Demo' } });
  if (existing) {
    console.log('Development seed already exists.');
    return;
  }

  const event = await prisma.event.create({ data: {
    name: 'TicketGuard Local Demo', description: 'Development-only event for exercising real TicketGuard flows.',
    venue: { create: { name: 'TicketGuard Test Venue', address: '1 Test Street', city: 'Ghaziabad', country: 'India' } },
    startAt: new Date(Date.now() + 60 * 60 * 1000), endAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    timezone: 'Asia/Kolkata', capacity: 100, status: EventStatus.PUBLISHED, organizer: { connect: { id: organizer.id } }
  }});
  const ticketType = await prisma.ticketType.create({ data: { eventId: event.id, name: 'GENERAL', price: 499, currency: 'INR', quantity: 100 } });
  await prisma.scannerAssignment.create({ data: { userId: scanner.id, eventId: event.id } });

  for (let i = 0; i < 2; i++) {
    const ticket = await prisma.ticket.create({ data: { eventId: event.id, ticketTypeId: ticketType.id, ownerId: user.id, ticketNumber: `TG-LOCAL-${i + 1}`, status: TicketStatus.ACTIVE } });
    const credential = TicketCredentialService.create();
    await prisma.ticketCredential.create({ data: { ticketId: ticket.id, identifier: credential.identifier, secretHash: credential.secretHash, secretCiphertext: credential.secretCiphertext } });
  }
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { soldCount: 2 } });
  console.log('Development seed created.');
  console.log('user@ticketguard.local / TicketGuard-Local-2026!');
  console.log('organizer@ticketguard.local / TicketGuard-Local-2026!');
  console.log('scanner@ticketguard.local / TicketGuard-Local-2026!');
  console.log('admin@ticketguard.local / TicketGuard-Local-2026!');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
