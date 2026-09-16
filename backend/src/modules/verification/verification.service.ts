import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { TicketCredentialService } from '../tickets/ticket-credential.service.js';
import { AuditService } from '../audit/audit.service.js';
import { emitToUser } from '../../infrastructure/websocket/socket.js';
import { SecurityService } from '../audit/security.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { safeEqualHash } from '../../utils/hash.js';
import type { Prisma } from '@prisma/client';

export class VerificationService {
  static async verify(scannerId: string, rawCredential: string, requestId: string, ipAddress?: string) {
    const parsed = TicketCredentialService.parse(rawCredential);
    if (!parsed) {
      await SecurityService.record({ actorId: scannerId, type: 'INVALID_QR', severity: 'MEDIUM', requestId, ...(ipAddress !== undefined ? { ipAddress } : {}) });
      throw new AppError('INVALID_CREDENTIAL', 'The ticket credential is invalid.', 400);
    }

    const result = await prisma.$transaction(async tx => {
      // The credential lookup and ticket lock live in the same transaction.
      // The ticket row is the serialization point for concurrent check-ins.
      const credentialRows = await tx.$queryRaw<Array<{
        id: string; ticket_id: string; secret_hash: string; status: 'ACTIVE' | 'REVOKED';
      }>>`
        SELECT id, ticket_id, secret_hash, status
        FROM ticket_credentials
        WHERE identifier = ${parsed.identifier}
        FOR UPDATE
      `;
      const credential = credentialRows[0];
      if (!credential || credential.status !== 'ACTIVE' || !safeEqualHash(parsed.secret, credential.secret_hash)) {
        throw new AppError('INVALID_CREDENTIAL', 'The ticket credential is invalid.', 400);
      }

      const ticketRows = await tx.$queryRaw<Array<{ id: string; event_id: string; owner_id: string; status: string }>>`
        SELECT id, event_id, owner_id, status
        FROM tickets
        WHERE id = ${credential.ticket_id}::uuid
        FOR UPDATE
      `;
      const ticket = ticketRows[0];
      if (!ticket) throw new AppError('INVALID_CREDENTIAL', 'The ticket credential is invalid.', 400);

      const assignment = await tx.scannerAssignment.findUnique({
        where: { userId_eventId: { userId: scannerId, eventId: ticket.event_id } }
      });
      if (!assignment) throw new AppError('UNAUTHORIZED_SCANNER', 'Scanner is not authorized for this event.', 403);

      const activeCredential = await tx.ticketCredential.findFirst({
        where: { ticketId: ticket.id, status: 'ACTIVE' },
        select: { identifier: true, secretHash: true }
      });
      if (!activeCredential || activeCredential.identifier !== parsed.identifier || !safeEqualHash(parsed.secret, activeCredential.secretHash)) {
        throw new AppError('INVALID_CREDENTIAL', 'The ticket credential is invalid.', 400);
      }

      const event = await tx.event.findUnique({ where: { id: ticket.event_id }, select: { status: true, startAt: true, endAt: true } });
      if (!event || event.status !== 'PUBLISHED' || new Date() < event.startAt || new Date() > event.endAt) {
        throw new AppError('EVENT_NOT_ACTIVE', 'This event is not currently active for check-in.', 409);
      }
      if (ticket.status === 'USED') throw new AppError('TICKET_ALREADY_USED', 'This ticket has already been used.', 409);
      if (ticket.status === 'CANCELLED') throw new AppError('TICKET_CANCELLED', 'This ticket has been cancelled.', 409);
      if (ticket.status === 'EXPIRED') throw new AppError('TICKET_EXPIRED', 'This ticket has expired.', 409);
      if (ticket.status !== 'ACTIVE') throw new AppError('TICKET_NOT_VERIFIABLE', 'This ticket is not currently valid for entry.', 409);

      const now = new Date();
      const updated = await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'USED', usedAt: now } });
      await AuditService.log({ actorId: scannerId, action: 'TICKET_VERIFIED', resourceType: 'TICKET', resourceId: ticket.id, requestId, metadata: { eventId: ticket.event_id } as Prisma.InputJsonValue }, tx);
      await AuditService.log({ actorId: scannerId, action: 'TICKET_USED', resourceType: 'TICKET', resourceId: ticket.id, requestId }, tx);
      const notification = await NotificationService.create({ userId: ticket.owner_id, type: 'TICKET_VERIFIED', title: 'Ticket verified', message: 'Your ticket was successfully checked in.' }, tx);
      return { ticketId: updated.id, ownerId: ticket.owner_id, usedAt: updated.usedAt, notification };
    });

    NotificationService.emitCommittedNotification(result.notification);
    emitToUser(result.ownerId, 'ticket.status_changed', { ticketId: result.ticketId, status: 'USED', usedAt: result.usedAt });
    return { result: 'VALID' as const, ticketId: result.ticketId, usedAt: result.usedAt };
  }
}
