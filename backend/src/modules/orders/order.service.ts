import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { TicketCredentialService } from '../tickets/ticket-credential.service.js';
import { TicketStateService } from '../tickets/ticket-state.service.js';
import { AuditService } from '../audit/audit.service.js';
import { paymentProvider } from './payment.provider.js';
import type { Prisma } from '@prisma/client';

const orderInclude = {
  items: { include: { event: { include: { venue: true } }, ticketType: true, tickets: true } },
  payment: true,
} satisfies Prisma.OrderInclude;

export class OrderService {
  static async checkout(userId: string, input: { items: Array<{ ticketTypeId: string; quantity: number }> }, requestId: string) {
    const merged = new Map<string, number>();
    for (const item of input.items) merged.set(item.ticketTypeId, (merged.get(item.ticketTypeId) ?? 0) + item.quantity);

    const items = [...merged.entries()].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const firstItem = items[0];
    if (!firstItem) throw new AppError('VALIDATION_ERROR', 'At least one ticket is required.', 400);
    return prisma.$transaction(async tx => {
      const first = await tx.ticketType.findUnique({ where: { id: firstItem.ticketTypeId }, select: { eventId: true, currency: true } });
      if (!first) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket type not found.', 404);

      let subtotal = 0;
      const prepared: Array<{ ticketTypeId: string; eventId: string; quantity: number; unitPrice: Prisma.Decimal }> = [];
      for (const requested of items) {
        const rows = await tx.$queryRaw<Array<{ id: string; event_id: string; name: string; price: Prisma.Decimal; currency: string; quantity: number; sold_count: number; status: string }>>`
          SELECT id, event_id, name, price, currency, quantity, sold_count, status
          FROM ticket_types
          WHERE id = ${requested.ticketTypeId}::uuid
          FOR UPDATE
        `;
        const type = rows[0];
        if (!type) throw new AppError('RESOURCE_NOT_FOUND', 'One or more ticket types no longer exist.', 404);
        if (type.event_id !== first.eventId) throw new AppError('INVALID_ORDER', 'All tickets in one checkout must belong to the same event.', 400);
        if (type.status !== 'ACTIVE') throw new AppError('TICKET_TYPE_INACTIVE', `${type.name} is no longer available.`, 409);
        if (type.sold_count + requested.quantity > type.quantity) throw new AppError('TICKET_INVENTORY_EXHAUSTED', `Not enough ${type.name} tickets are available.`, 409);
        subtotal += Number(type.price) * requested.quantity;
        prepared.push({ ticketTypeId: type.id, eventId: type.event_id, quantity: requested.quantity, unitPrice: type.price });
      }

      const event = await tx.event.findUnique({ where: { id: first.eventId }, select: { id: true, name: true, status: true, startAt: true, endAt: true } });
      if (!event || event.status !== 'PUBLISHED' || event.endAt <= new Date()) throw new AppError('EVENT_NOT_AVAILABLE', 'This event is no longer available for purchase.', 409);

      const order = await tx.order.create({
        data: {
          userId,
          status: 'PENDING',
          currency: first.currency,
          subtotal,
          total: subtotal,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          items: { create: prepared.map(item => ({ eventId: item.eventId, ticketTypeId: item.ticketTypeId, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: Number(item.unitPrice) * item.quantity })) },
          payment: { create: { provider: 'SANDBOX', amount: subtotal, currency: first.currency, status: 'PENDING' } },
        },
        include: orderInclude,
      });
      await AuditService.log({ actorId: userId, action: 'ORDER_CREATED', resourceType: 'ORDER', resourceId: order.id, requestId, metadata: { eventId: first.eventId, total: subtotal, currency: first.currency } as Prisma.InputJsonValue }, tx);
      return order;
    });
  }

  static async pay(userId: string, orderId: string, requestId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payment: true } });
    if (!order) throw new AppError('RESOURCE_NOT_FOUND', 'Order not found.', 404);
    if (order.userId !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this order.', 403);
    if (order.status === 'CONFIRMED') return this.getOwned(userId, orderId);
    if (order.status !== 'PENDING' || !order.payment) throw new AppError('ORDER_INVALID_STATE', 'This order cannot be paid.', 409);
    if (order.expiresAt && order.expiresAt <= new Date()) {
      await prisma.order.update({ where: { id: orderId }, data: { status: 'EXPIRED' } });
      throw new AppError('ORDER_EXPIRED', 'This checkout session has expired. Please start again.', 409);
    }

    const payment = await paymentProvider.charge({ orderId, amount: order.total.toString(), currency: order.currency });
    if (payment.status !== 'SUCCEEDED') {
      await prisma.$transaction(async tx => {
        await tx.payment.update({ where: { orderId }, data: { status: 'FAILED', providerRef: payment.providerRef } });
        await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
        await AuditService.log({ actorId: userId, action: 'PAYMENT_FAILED', resourceType: 'ORDER', resourceId: orderId, requestId }, tx);
      });
      throw new AppError('PAYMENT_FAILED', 'Payment was not successful.', 402);
    }

    return prisma.$transaction(async tx => {
      const locked = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payment: true } });
      if (!locked || locked.userId !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this order.', 403);
      if (locked.status === 'CONFIRMED') return locked;
      if (locked.status !== 'PENDING') throw new AppError('ORDER_INVALID_STATE', 'This order is no longer payable.', 409);

      const eventIds = [...new Set(locked.items.map(item => item.eventId))];
      for (const eventId of eventIds) await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;

      const createdTicketIds: string[] = [];
      for (const item of locked.items) {
        const rows = await tx.$queryRaw<Array<{ id: string; quantity: number; sold_count: number; status: string }>>`
          SELECT id, quantity, sold_count, status FROM ticket_types WHERE id = ${item.ticketTypeId}::uuid FOR UPDATE
        `;
        const type = rows[0];
        if (!type || type.status !== 'ACTIVE' || type.sold_count + item.quantity > type.quantity) {
          await tx.payment.update({ where: { orderId }, data: { status: 'FAILED', providerRef: payment.providerRef } });
          await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
          await AuditService.log({ actorId: userId, action: 'PAYMENT_FAILED', resourceType: 'ORDER', resourceId: orderId, requestId, metadata: { reason: 'INVENTORY_CHANGED' } as Prisma.InputJsonValue }, tx);
          throw new AppError('TICKET_INVENTORY_EXHAUSTED', 'Ticket inventory changed while you were checking out. Your payment was not captured.', 409);
        }
        await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { soldCount: { increment: item.quantity } } });
        for (let i = 0; i < item.quantity; i++) {
          const ticket = await tx.ticket.create({ data: { eventId: item.eventId, ticketTypeId: item.ticketTypeId, orderItemId: item.id, ownerId: userId, ticketNumber: `TG-${randomUUID()}`, status: 'ISSUED' } });
          const credential = TicketCredentialService.create();
          await tx.ticketCredential.create({ data: { ticketId: ticket.id, identifier: credential.identifier, secretHash: credential.secretHash, secretCiphertext: credential.secretCiphertext } });
          await TicketStateService.transition(tx, ticket.id, 'ISSUED', 'ACTIVE');
          createdTicketIds.push(ticket.id);
          await AuditService.log({ actorId: userId, action: 'TICKET_ISSUED', resourceType: 'TICKET', resourceId: ticket.id, requestId, metadata: { orderId, eventId: item.eventId, ticketTypeId: item.ticketTypeId, purchase: true } as Prisma.InputJsonValue }, tx);
        }
      }

      await tx.payment.update({ where: { orderId }, data: { status: 'SUCCEEDED', providerRef: payment.providerRef, paidAt: new Date() } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED', expiresAt: null } });
      await AuditService.log({ actorId: userId, action: 'PAYMENT_SUCCEEDED', resourceType: 'ORDER', resourceId: orderId, requestId, metadata: { ticketIds: createdTicketIds } as Prisma.InputJsonValue }, tx);
      return this.getOwnedTx(tx, userId, orderId);
    });
  }

  static async listOwned(userId: string) {
    return prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  static async getOwned(userId: string, orderId: string) {
    return prisma.$transaction(tx => this.getOwnedTx(tx, userId, orderId));
  }

  private static async getOwnedTx(tx: Prisma.TransactionClient, userId: string, orderId: string) {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new AppError('RESOURCE_NOT_FOUND', 'Order not found.', 404);
    if (order.userId !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this order.', 403);
    return order;
  }
}
