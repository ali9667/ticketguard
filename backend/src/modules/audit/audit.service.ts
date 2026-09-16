import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';

type DbClient = typeof prisma | Prisma.TransactionClient;

export class AuditService {
  static async log(input: { actorId: string | undefined; action: AuditAction; resourceType: string; resourceId: string | undefined; requestId: string; metadata?: Prisma.InputJsonValue }, db: DbClient = prisma) {
    return db.auditLog.create({ data: { ...(input.actorId ? { actorId: input.actorId } : {}), action: input.action, resourceType: input.resourceType, ...(input.resourceId ? { resourceId: input.resourceId } : {}), requestId: input.requestId, ...(input.metadata !== undefined ? { metadata: input.metadata } : {}) } });
  }
}
