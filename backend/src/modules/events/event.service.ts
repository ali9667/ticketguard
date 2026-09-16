import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '@prisma/client';

const EVENT_SELECT = {
  id: true,
  name: true,
  description: true,
  venueId: true,
  startAt: true,
  endAt: true,
  timezone: true,
  capacity: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  venue: true,
  ticketTypes: { orderBy: { name: 'asc' as const } },
} satisfies Prisma.EventSelect;

const PUBLIC_EVENT_SELECT = {
  id: true,
  name: true,
  description: true,
  startAt: true,
  endAt: true,
  timezone: true,
  capacity: true,
  status: true,
  venue: true,
  ticketTypes: { where: { status: 'ACTIVE' as const }, orderBy: { name: 'asc' as const } },
} satisfies Prisma.EventSelect;

function assertEventOwner(event: { createdBy: string }, userId: string) {
  if (event.createdBy !== userId) throw new AppError('FORBIDDEN', 'You do not own this event.', 403);
}

export class EventService {
  static async create(userId: string, input: { name: string; description?: string; venue: { name: string; address: string; city: string; country: string }; startAt: Date; endAt: Date; timezone: string; capacity: number }, requestId: string) {
    return prisma.$transaction(async tx => {
      const event = await tx.event.create({
        data: {
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          startAt: input.startAt,
          endAt: input.endAt,
          timezone: input.timezone,
          capacity: input.capacity,
          organizer: { connect: { id: userId } },
          venue: { create: input.venue },
        },
        select: EVENT_SELECT,
      });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'EVENT', resourceId: event.id, requestId, metadata: { event: 'EVENT_CREATED' } as Prisma.InputJsonValue }, tx);
      return event;
    });
  }

  static async update(userId: string, eventId: string, input: { name?: string; description?: string | null; startAt?: Date; endAt?: Date; timezone?: string; capacity?: number; venue?: { name: string; address: string; city: string; country: string } }, requestId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true, status: true, startAt: true, endAt: true, capacity: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      if (event.status !== 'DRAFT') throw new AppError('EVENT_INVALID_STATE', 'Only draft events can be edited.', 409);

      const startAt = input.startAt ?? event.startAt;
      const endAt = input.endAt ?? event.endAt;
      if (endAt <= startAt) throw new AppError('INVALID_EVENT_DATES', 'endAt must be after startAt.', 400);

      if (input.capacity !== undefined) {
        const totalTicketCapacity = await tx.ticketType.aggregate({ where: { eventId }, _sum: { quantity: true } });
        if ((totalTicketCapacity._sum.quantity ?? 0) > input.capacity) {
          throw new AppError('EVENT_CAPACITY_TOO_LOW', 'Event capacity cannot be lower than the configured ticket inventory.', 409);
        }
      }

      const { venue, ...eventData } = input;
      const updated = await tx.event.update({ where: { id: eventId }, data: { ...eventData, startAt, endAt, ...(venue ? { venue: { update: venue } } : {}) }, select: EVENT_SELECT });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'EVENT', resourceId: eventId, requestId, metadata: { event: 'EVENT_UPDATED' } as Prisma.InputJsonValue }, tx);
      return updated;
    });
  }

  static async publish(userId: string, eventId: string, requestId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true, status: true, capacity: true, startAt: true, endAt: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      if (event.status !== 'DRAFT') throw new AppError('EVENT_INVALID_STATE', 'Only draft events can be published.', 409);
      if (event.endAt <= new Date()) throw new AppError('EVENT_INVALID_STATE', 'An event that has already ended cannot be published.', 409);

      const types = await tx.ticketType.findMany({ where: { eventId }, select: { quantity: true, status: true } });
      if (types.length === 0) throw new AppError('EVENT_MISSING_TICKET_TYPES', 'At least one ticket type is required before publishing.', 409);
      const totalInventory = types.reduce((sum, type) => sum + type.quantity, 0);
      if (totalInventory > event.capacity) throw new AppError('EVENT_CAPACITY_EXCEEDED', 'Configured ticket inventory exceeds event capacity.', 409);
      if (!types.some((type) => type.status === 'ACTIVE')) throw new AppError('EVENT_NO_ACTIVE_TICKET_TYPE', 'At least one ticket type must be active before publishing.', 409);

      const updated = await tx.event.update({ where: { id: eventId }, data: { status: 'PUBLISHED' }, select: EVENT_SELECT });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'EVENT', resourceId: eventId, requestId, metadata: { event: 'EVENT_PUBLISHED' } as Prisma.InputJsonValue }, tx);
      return updated;
    });
  }

  static async cancel(userId: string, eventId: string, requestId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true, status: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      if (event.status === 'COMPLETED' || event.status === 'CANCELLED') throw new AppError('EVENT_INVALID_STATE', 'Event cannot be cancelled from its current state.', 409);

      const now = new Date();
      const updated = await tx.event.update({ where: { id: eventId }, data: { status: 'CANCELLED' }, select: EVENT_SELECT });
      await tx.ticket.updateMany({ where: { eventId, status: { in: ['ISSUED', 'ACTIVE', 'TRANSFER_PENDING', 'TRANSFERRED'] } }, data: { status: 'CANCELLED', cancelledAt: now } });
      await tx.ticketCredential.updateMany({ where: { ticket: { eventId }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: now } });
      await tx.transfer.updateMany({ where: { ticket: { eventId }, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: now } });
      await AuditService.log({ actorId: userId, action: 'TICKET_CANCELLED', resourceType: 'EVENT', resourceId: eventId, requestId, metadata: { event: 'EVENT_CANCELLED' } as Prisma.InputJsonValue }, tx);
      return updated;
    });
  }

  static async assignScanner(userId: string, eventId: string, scannerId: string, requestId: string) {
    return prisma.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true, status: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      if (event.status === 'CANCELLED' || event.status === 'COMPLETED') throw new AppError('EVENT_INVALID_STATE', 'Scanner assignments are not allowed for this event.', 409);
      const scanner = await tx.user.findUnique({ where: { id: scannerId }, select: { id: true, role: true, status: true } });
      if (!scanner || scanner.role !== 'SCANNER' || scanner.status !== 'ACTIVE') throw new AppError('INVALID_SCANNER', 'The selected user is not an active scanner.', 400);
      const assignment = await tx.scannerAssignment.upsert({ where: { userId_eventId: { userId: scannerId, eventId } }, update: {}, create: { userId: scannerId, eventId } });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'SCANNER_ASSIGNMENT', resourceId: assignment.id, requestId, metadata: { eventId, scannerId } as Prisma.InputJsonValue }, tx);
      return assignment;
    });
  }

  static async listScanners(userId: string, eventId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true } });
    if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
    assertEventOwner(event, userId);
    return prisma.scannerAssignment.findMany({
      where: { eventId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async removeScanner(userId: string, eventId: string, scannerId: string, requestId: string) {
    return prisma.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      const assignment = await tx.scannerAssignment.findUnique({ where: { userId_eventId: { userId: scannerId, eventId } } });
      if (!assignment) throw new AppError('RESOURCE_NOT_FOUND', 'Scanner is not assigned to this event.', 404);
      await tx.scannerAssignment.delete({ where: { id: assignment.id } });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'SCANNER_ASSIGNMENT', resourceId: assignment.id, requestId, metadata: { eventId, scannerId, event: 'SCANNER_UNASSIGNED' } as Prisma.InputJsonValue }, tx);
      return { id: assignment.id, eventId, scannerId, removed: true };
    });
  }

  static async createTicketType(userId: string, eventId: string, input: { name: string; price: number; currency: string; quantity: number }, requestId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true, status: true, capacity: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      if (event.status !== 'DRAFT') throw new AppError('EVENT_INVALID_STATE', 'Ticket types can only be configured while the event is a draft.', 409);

      const totals = await tx.ticketType.aggregate({ where: { eventId }, _sum: { quantity: true } });
      if ((totals._sum.quantity ?? 0) + input.quantity > event.capacity) throw new AppError('EVENT_CAPACITY_EXCEEDED', 'Ticket type inventory would exceed event capacity.', 409);

      const ticketType = await tx.ticketType.create({ data: { eventId, name: input.name, price: input.price, currency: input.currency, quantity: input.quantity } });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'TICKET_TYPE', resourceId: ticketType.id, requestId, metadata: { event: 'TICKET_TYPE_CREATED', eventId } as Prisma.InputJsonValue }, tx);
      return ticketType;
    });
  }

  static async updateTicketType(userId: string, eventId: string, ticketTypeId: string, input: { name?: string; price?: number; currency?: string; quantity?: number; status?: 'ACTIVE' | 'INACTIVE' }, requestId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdBy: true, status: true, capacity: true } });
      if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
      assertEventOwner(event, userId);
      if (event.status !== 'DRAFT') throw new AppError('EVENT_INVALID_STATE', 'Ticket types can only be modified while the event is a draft.', 409);

      const ticketType = await tx.ticketType.findFirst({ where: { id: ticketTypeId, eventId }, select: { id: true, quantity: true, soldCount: true } });
      if (!ticketType) throw new AppError('RESOURCE_NOT_FOUND', 'Ticket type not found.', 404);
      if (input.quantity !== undefined && input.quantity < ticketType.soldCount) throw new AppError('TICKET_INVENTORY_INVALID', 'Quantity cannot be lower than tickets already issued.', 409);

      if (input.quantity !== undefined) {
        const others = await tx.ticketType.aggregate({ where: { eventId, id: { not: ticketTypeId } }, _sum: { quantity: true } });
        if ((others._sum.quantity ?? 0) + input.quantity > event.capacity) throw new AppError('EVENT_CAPACITY_EXCEEDED', 'Ticket type inventory would exceed event capacity.', 409);
      }

      const updated = await tx.ticketType.update({ where: { id: ticketTypeId }, data: input });
      await AuditService.log({ actorId: userId, action: 'ADMIN_ACTION', resourceType: 'TICKET_TYPE', resourceId: ticketTypeId, requestId, metadata: { event: 'TICKET_TYPE_UPDATED', eventId } as Prisma.InputJsonValue }, tx);
      return updated;
    });
  }

  static async listMine(userId: string) {
    return prisma.event.findMany({ where: { createdBy: userId }, include: { venue: true, ticketTypes: true }, orderBy: { startAt: 'asc' }, take: 100 });
  }

  static async list(query: unknown) {
  const params = query as Record<string, unknown>;

  const limit = Math.min(
    Math.max(Number(params.limit ?? 20) || 20, 1),
    100,
  );

  return prisma.event.findMany({
    where: {
      status: 'PUBLISHED',
      endAt: {
        gte: new Date(),
      },
    },
    include: {
      venue: true,
      ticketTypes: {
        where: {
          status: 'ACTIVE',
        },
      },
    },
    orderBy: [
      {
        startAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    take: limit,
  });
}

  static async getPublic(eventId: string) {
    const event = await prisma.event.findFirst({ where: { id: eventId, status: 'PUBLISHED', endAt: { gte: new Date() } }, select: PUBLIC_EVENT_SELECT });
    if (!event) throw new AppError('RESOURCE_NOT_FOUND', 'Event not found.', 404);
    return event;
  }
}
