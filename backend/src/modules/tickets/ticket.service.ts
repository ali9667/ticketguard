import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { TicketCredentialService } from './ticket-credential.service.js';
import { assertTicketTransition } from './ticket-state.js';
import { TicketStateService } from './ticket-state.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '@prisma/client';

export class TicketService {
  static async issue(organizerId: string, eventId: string, input: { ticketTypeId: string; ownerId: string; quantity: number }, requestId: string) {
    if (input.quantity < 1 || input.quantity > 100) throw new AppError('VALIDATION_ERROR', 'Quantity must be between 1 and 100.', 400);
    return prisma.$transaction(async tx => {
      const eventRows = await tx.$queryRaw<Array<{ id: string; created_by: string; status: string; capacity: number }>>`
        SELECT id, created_by, status, capacity FROM events WHERE id = ${eventId}::uuid FOR UPDATE
      `;
      const event = eventRows[0];
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      if (event.created_by !== organizerId) throw new AppError('FORBIDDEN', 'You do not own this event.', 403);
      if (event.status !== 'PUBLISHED') throw new AppError('EVENT_NOT_PUBLISHED', 'Tickets can only be issued for published events.', 409);
      const issuedRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM tickets WHERE event_id = ${eventId}::uuid
      `;
      const issuedCount = Number(issuedRows[0]?.count ?? 0n);
      if (issuedCount + input.quantity > event.capacity) throw new AppError('EVENT_CAPACITY_EXCEEDED', 'Issuing these tickets would exceed the event capacity.', 409);
      const types = await tx.$queryRaw<Array<{ id: string; quantity: number; sold_count: number; status: string }>>`
        SELECT id, quantity, sold_count, status FROM ticket_types WHERE id = ${input.ticketTypeId}::uuid AND event_id = ${eventId}::uuid FOR UPDATE
      `;
      const type = types[0];
      if (!type) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket type not found.', 404);
      if (type.status !== 'ACTIVE') throw new AppError('TICKET_TYPE_INACTIVE', 'Ticket type is inactive.', 409);
      if (type.sold_count + input.quantity > type.quantity) throw new AppError('TICKET_INVENTORY_EXHAUSTED', 'Not enough tickets are available.', 409);
      const owner = await tx.user.findUnique({ where: { id: input.ownerId }, select: { id: true, status: true } });
      if (!owner || owner.status !== 'ACTIVE') throw new AppError('RESOURCE_NOT_FOUND', 'Ticket owner was not found.', 404);
      await tx.ticketType.update({ where: { id: input.ticketTypeId }, data: { soldCount: { increment: input.quantity } } });
      const created=[];
      for(let i=0;i<input.quantity;i++){
        const ticket=await tx.ticket.create({data:{eventId,ticketTypeId:input.ticketTypeId,ownerId:input.ownerId,ticketNumber:`TG-${randomUUID()}`,status:'ISSUED'}});
        const credential=TicketCredentialService.create();
        await tx.ticketCredential.create({data:{ticketId:ticket.id,identifier:credential.identifier,secretHash:credential.secretHash,secretCiphertext:credential.secretCiphertext}});
        created.push({...ticket, credentialPayload:credential.payload});
        await TicketStateService.transition(tx, ticket.id, 'ISSUED', 'ACTIVE');
        await AuditService.log({actorId:organizerId,action:'TICKET_ISSUED',resourceType:'TICKET',resourceId:ticket.id,requestId,metadata:{ownerId:input.ownerId,eventId,ticketTypeId:input.ticketTypeId} as Prisma.InputJsonValue}, tx);
      }
      return created.map(({ credentialPayload: _credentialPayload, ...ticket }) => ticket);
    });
  }

  static async listOwned(userId: string) {
    return prisma.ticket.findMany({ where: { ownerId: userId }, include: { event: { include: { venue: true } }, ticketType: true, credentials: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 1, select: { identifier: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  static async getOwned(userId: string, ticketId: string) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { event: { include: { venue: true } }, ticketType: true, credentials: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, identifier: true, status: true, secretCiphertext: true } } } });
    if (!ticket) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket not found.', 404);
    if (ticket.ownerId !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this ticket.', 403);
    const credential = ticket.credentials[0];
    return { ...ticket, credential, credentialPayload: credential ? TicketCredentialService.payloadFromStored(credential) : undefined };
  }

  static async cancel(actorId: string, ticketId: string, requestId: string) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, ownerId: true, status: true, eventId: true } });
      if (!ticket) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket not found.', 404);
      if (ticket.ownerId !== actorId) {
        const organizer = await tx.event.findFirst({ where: { id: ticket.eventId, createdBy: actorId }, select: { id: true } });
        if (!organizer) throw new AppError('FORBIDDEN', 'You cannot cancel this ticket.', 403);
      }
      assertTicketTransition(ticket.status, 'CANCELLED');
      await TicketStateService.transition(tx, ticketId, ticket.status, 'CANCELLED');
      const updated = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      await tx.ticketCredential.updateMany({ where: { ticketId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.transfer.updateMany({ where: { ticketId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await AuditService.log({ actorId, action: 'TICKET_CANCELLED', resourceType: 'TICKET', resourceId: ticketId, requestId }, tx);
      return updated;
    });
  }
}

