import type { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { AuditService } from '../audit/audit.service.js';

const pageSize = (value: unknown, fallback = 25) => {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), 100) : fallback;
};

export class AdminService {
  static async listUsers(query: { limit?: unknown; cursor?: unknown; status?: unknown; role?: unknown }) {
    const limit = pageSize(query.limit);
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status as UserStatus } : {}),
      ...(query.role ? { role: query.role as never } : {})
    };
    const rows = await prisma.user.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(typeof query.cursor === 'string' ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true, updatedAt: true }
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null };
  }

  static async setUserStatus(adminId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED', requestId: string) {
    if (adminId === userId) throw new AppError('ADMIN_SELF_MUTATION_FORBIDDEN', 'An administrator cannot change their own account status.', 409);
    return prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true, role: true } });
      if (!user) throw new AppError('RESOURCE_NOT_FOUND', 'User not found.', 404);
      if (user.status === 'DELETED') throw new AppError('USER_DELETED', 'Deleted users cannot be reactivated.', 409);
      if (user.status === status) return user;
      const updated = await tx.user.update({ where: { id: userId }, data: { status, deletedAt: null } });
      if (status === 'SUSPENDED') await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.log({ actorId: adminId, action: 'ADMIN_ACTION', resourceType: 'USER', resourceId: userId, requestId, metadata: { event: 'USER_STATUS_CHANGED', from: user.status, to: status } as Prisma.InputJsonValue }, tx);
      if (status === 'SUSPENDED') await AuditService.log({ actorId: adminId, action: 'USER_SUSPENDED', resourceType: 'USER', resourceId: userId, requestId }, tx);
      return updated;
    });
  }

  static async listAudit(query: { limit?: unknown; cursor?: unknown; actorId?: unknown; resourceType?: unknown; action?: unknown }) {
    const limit = pageSize(query.limit);
    const rows = await prisma.auditLog.findMany({
      where: { ...(typeof query.actorId === 'string' ? { actorId: query.actorId } : {}), ...(typeof query.resourceType === 'string' ? { resourceType: query.resourceType } : {}), ...(typeof query.action === 'string' ? { action: query.action as never } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(typeof query.cursor === 'string' ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > limit; const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null };
  }

  static async listSecurity(query: { limit?: unknown; cursor?: unknown; severity?: unknown; type?: unknown }) {
    const limit = pageSize(query.limit);
    const rows = await prisma.securityEvent.findMany({
      where: { ...(typeof query.severity === 'string' ? { severity: query.severity as never } : {}), ...(typeof query.type === 'string' ? { type: query.type as never } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(typeof query.cursor === 'string' ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > limit; const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null };
  }

  static async listEvents(query: { limit?: unknown; cursor?: unknown }) {
    const limit = pageSize(query.limit);
    const rows = await prisma.event.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(typeof query.cursor === 'string' ? { cursor: { id: query.cursor }, skip: 1 } : {}), include: { venue: true, organizer: { select: { id: true, email: true, firstName: true, lastName: true } } } });
    const hasMore = rows.length > limit; const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null };
  }

  static async listTickets(query: { limit?: unknown; cursor?: unknown; status?: unknown }) {
    const limit = pageSize(query.limit);
    const rows = await prisma.ticket.findMany({ ...(typeof query.status === 'string' ? { where: { status: query.status as never } } : {}), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(typeof query.cursor === 'string' ? { cursor: { id: query.cursor }, skip: 1 } : {}), select: { id: true, ticketNumber: true, status: true, eventId: true, ticketTypeId: true, ownerId: true, issuedAt: true, usedAt: true, cancelledAt: true, createdAt: true } });
    const hasMore = rows.length > limit; const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null };
  }
}
