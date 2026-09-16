import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { TicketCredentialService } from '../tickets/ticket-credential.service.js';
import { assertTicketTransition } from '../tickets/ticket-state.js';
import { TicketStateService } from '../tickets/ticket-state.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma, TicketStatus } from '@prisma/client';
import { emitToUser } from '../../infrastructure/websocket/socket.js';
import { NotificationService } from '../notifications/notification.service.js';

const TRANSFER_TTL_MS = 15 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export class TransferService {
  static async create(ownerId: string, ticketId: string, recipientEmail: string, requestId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, ownerId: true, status: true, eventId: true } });
      if (!ticket) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket not found.', 404);
      // This lock is the serialization point for all transfer creation attempts on this ticket.
      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
      const locked = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, ownerId: true, status: true, eventId: true } });
      if (!locked) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket not found.', 404);
      if (locked.ownerId !== ownerId) throw new AppError('FORBIDDEN', 'You do not own this ticket.', 403);
      assertTicketTransition(locked.status, 'TRANSFER_PENDING');

      const recipient = await tx.user.findUnique({ where: { email: recipientEmail.toLowerCase() }, select: { id: true, status: true, email: true } });
      if (!recipient || recipient.status !== 'ACTIVE') throw new AppError('RESOURCE_NOT_FOUND', 'Recipient account was not found.', 404);
      if (recipient.id === ownerId) throw new AppError('TRANSFER_SELF_NOT_ALLOWED', 'You cannot transfer a ticket to yourself.', 409);

      const active = await tx.transfer.findFirst({ where: { ticketId, status: 'PENDING' }, select: { id: true } });
      if (active) throw new AppError('TRANSFER_CONFLICT', 'This ticket already has a pending transfer.', 409);

      const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
      await TicketStateService.transition(tx, ticketId, locked.status, 'TRANSFER_PENDING');
      const transfer = await tx.transfer.create({
        data: {
          ticketId,
          initiatorId: ownerId,
          recipientId: recipient.id,
          expiresAt,
          recipientRecord: { create: { recipientId: recipient.id, email: recipient.email } }
        },
        include: { recipient: { select: { id: true, email: true, firstName: true, lastName: true } } }
      });

      const notification = await NotificationService.create({ userId: recipient.id, type: 'TRANSFER_RECEIVED', title: 'Ticket transfer received', message: 'You have a ticket transfer waiting for acceptance.' }, tx);
      await AuditService.log({ actorId: ownerId, action: 'TICKET_TRANSFER_STARTED', resourceType: 'TRANSFER', resourceId: transfer.id, requestId, metadata: { ticketId, recipientId: recipient.id } as Prisma.InputJsonValue }, tx);
      return { transfer, recipientId: recipient.id, notification };
    });
    NotificationService.emitCommittedNotification(result.notification);
    emitToUser(result.recipientId, 'transfer.created', { transferId: result.transfer.id, ticketId });
    return result.transfer;
  }

  static async list(userId: string) {
    return prisma.transfer.findMany({
      where: { OR: [{ initiatorId: userId }, { recipientId: userId }] },
      include: { ticket: { include: { event: true, ticketType: true } }, initiator: { select: { id: true, email: true, firstName: true, lastName: true } }, recipient: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }, take: 50
    });
  }

  static async get(userId: string, id: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: { ticket: { include: { event: true, ticketType: true } }, initiator: true, recipient: true, recipientRecord: true }
    });
    if (!transfer) throw new AppError('RESOURCE_NOT_FOUND', 'Transfer not found.', 404);
    if (transfer.initiatorId !== userId && transfer.recipientId !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this transfer.', 403);
    return transfer;
  }

  static async accept(recipientId: string, id: string, requestId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({ where: { id }, select: { id: true, ticketId: true, initiatorId: true, recipientId: true, status: true, expiresAt: true } });
      if (!transfer) throw new AppError('RESOURCE_NOT_FOUND', 'Transfer not found.', 404);
      await tx.$queryRaw`SELECT id FROM transfers WHERE id = ${id}::uuid FOR UPDATE`;
      const lockedTransfer = await tx.transfer.findUnique({ where: { id }, select: { id: true, ticketId: true, initiatorId: true, recipientId: true, status: true, expiresAt: true } });
      if (!lockedTransfer) throw new AppError('RESOURCE_NOT_FOUND', 'Transfer not found.', 404);
      if (lockedTransfer.recipientId !== recipientId) throw new AppError('FORBIDDEN', 'You cannot accept this transfer.', 403);
      if (lockedTransfer.status !== 'PENDING') throw new AppError('TRANSFER_ALREADY_ACCEPTED', 'Transfer is no longer pending.', 409);
      if (lockedTransfer.expiresAt <= new Date()) {
        await expireLockedTransfer(tx, lockedTransfer.id, lockedTransfer.ticketId, lockedTransfer.initiatorId);
        throw new AppError('TRANSFER_EXPIRED', 'Transfer has expired.', 409);
      }

      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${lockedTransfer.ticketId}::uuid FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { id: lockedTransfer.ticketId }, select: { id: true, ownerId: true, status: true } });
      if (!ticket) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket not found.', 404);
      if (ticket.ownerId !== lockedTransfer.initiatorId || ticket.status !== 'TRANSFER_PENDING') throw new AppError('TRANSFER_CONFLICT', 'Ticket is no longer transferable.', 409);

      const credential = await TicketCredentialService.revokeAndCreate(ticket.id, tx);
      await TicketStateService.transition(tx, ticket.id, ticket.status, 'ACTIVE');
      await tx.ticket.update({ where: { id: ticket.id }, data: { ownerId: recipientId } });
      const completed = await tx.transfer.update({ where: { id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });

      const initiatorNotification = await NotificationService.create({ userId: lockedTransfer.initiatorId, type: 'TICKET_TRANSFERRED', title: 'Ticket transferred', message: 'Your ticket was transferred successfully.' }, tx);
      const recipientNotification = await NotificationService.create({ userId: recipientId, type: 'TRANSFER_ACCEPTED', title: 'Transfer accepted', message: 'A ticket transfer was accepted into your account.' }, tx);
      await AuditService.log({ actorId: recipientId, action: 'TICKET_TRANSFER_ACCEPTED', resourceType: 'TRANSFER', resourceId: id, requestId, metadata: { ticketId: ticket.id } as Prisma.InputJsonValue }, tx);
      return { transfer: completed, credentialPayload: credential.payload, initiatorId: lockedTransfer.initiatorId, ticketId: ticket.id, initiatorNotification, recipientNotification };
    });

    NotificationService.emitCommittedNotification(result.initiatorNotification);
    NotificationService.emitCommittedNotification(result.recipientNotification);
    emitToUser(result.initiatorId, 'transfer.accepted', { transferId: id, ticketId: result.ticketId });
    emitToUser(recipientId, 'ticket.status_changed', { ticketId: result.ticketId, status: 'ACTIVE' });
    return { transfer: result.transfer, credentialPayload: result.credentialPayload };
  }

  static async reject(userId: string, id: string, requestId: string) {
    return this.finish(userId, id, 'REJECTED', requestId, 'recipient');
  }

  static async cancel(userId: string, id: string, requestId: string) {
    return this.finish(userId, id, 'CANCELLED', requestId, 'initiator');
  }

  private static async finish(userId: string, id: string, status: 'REJECTED' | 'CANCELLED', requestId: string, actorType: 'initiator' | 'recipient') {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM transfers WHERE id = ${id}::uuid FOR UPDATE`;
      const transfer = await tx.transfer.findUnique({ where: { id }, select: { id: true, ticketId: true, initiatorId: true, recipientId: true, status: true } });
      if (!transfer) throw new AppError('RESOURCE_NOT_FOUND', 'Transfer not found.', 404);
      if (actorType === 'initiator' && transfer.initiatorId !== userId) throw new AppError('FORBIDDEN', 'Only the transfer initiator can cancel this transfer.', 403);
      if (actorType === 'recipient' && transfer.recipientId !== userId) throw new AppError('FORBIDDEN', 'Only the recipient can reject this transfer.', 403);
      if (transfer.status !== 'PENDING') throw new AppError('TRANSFER_CONFLICT', 'Transfer is no longer pending.', 409);

      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${transfer.ticketId}::uuid FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { id: transfer.ticketId }, select: { id: true, status: true } });
      if (!ticket) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket not found.', 404);
      assertTicketTransition(ticket.status, 'ACTIVE');
      await TicketStateService.transition(tx, ticket.id, ticket.status, 'ACTIVE');

      const updated = await tx.transfer.update({ where: { id }, data: { status, ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : { rejectedAt: new Date() }) } });
      const notifyUserId = actorType === 'recipient' ? transfer.initiatorId : transfer.recipientId;
      const notification = await NotificationService.create({ userId: notifyUserId, type: 'TRANSFER_REJECTED', title: status === 'REJECTED' ? 'Transfer rejected' : 'Transfer cancelled', message: status === 'REJECTED' ? 'The recipient rejected your ticket transfer.' : 'The ticket transfer was cancelled.' }, tx);
      await AuditService.log({ actorId: userId, action: status === 'CANCELLED' ? 'ADMIN_ACTION' : 'TICKET_TRANSFER_REJECTED', resourceType: 'TRANSFER', resourceId: id, requestId }, tx);
      return { updated, notifyUserId, ticketId: transfer.ticketId, notification };
    });
    NotificationService.emitCommittedNotification(result.notification);
    emitToUser(result.notifyUserId, status === 'REJECTED' ? 'transfer.rejected' : 'transfer.cancelled', { transferId: id, ticketId: result.ticketId });
    emitToUser(result.notifyUserId, 'ticket.status_changed', { ticketId: result.ticketId, status: 'ACTIVE' });
    return result.updated;
  }

  static async expirePending() {
    const candidates = await prisma.transfer.findMany({ where: { status: 'PENDING', expiresAt: { lte: new Date() } }, select: { id: true } });
    for (const item of candidates) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM transfers WHERE id = ${item.id}::uuid FOR UPDATE`;
        const transfer = await tx.transfer.findUnique({ where: { id: item.id }, select: { id: true, ticketId: true, initiatorId: true, status: true } });
        if (!transfer || transfer.status !== 'PENDING') return;
        return expireLockedTransfer(tx, transfer.id, transfer.ticketId, transfer.initiatorId);
      }).then(result => {
        if (result) {
          NotificationService.emitCommittedNotification(result.notification);
          emitToUser(result.initiatorId, 'transfer.expired', { transferId: result.transferId, ticketId: result.ticketId });
        }
      });
    }
  }
}

async function expireLockedTransfer(tx: Tx, transferId: string, ticketId: string, initiatorId: string) {
  const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, status: true } });
  if (ticket?.status === 'TRANSFER_PENDING') await TicketStateService.transition(tx, ticket.id, ticket.status, 'ACTIVE');
  await tx.transfer.update({ where: { id: transferId }, data: { status: 'EXPIRED' } });
  const notification = await NotificationService.create({ userId: initiatorId, type: 'TRANSFER_EXPIRED', title: 'Transfer expired', message: 'Your ticket transfer request expired.' }, tx);
  await AuditService.log({ actorId: initiatorId, action: 'TICKET_TRANSFER_EXPIRED', resourceType: 'TRANSFER', resourceId: transferId, requestId: 'job' }, tx);
  return { notification, ticketId, initiatorId, transferId };
}
