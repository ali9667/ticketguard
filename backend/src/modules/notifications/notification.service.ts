import type { Prisma, NotificationType } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { emitToUser } from '../../infrastructure/websocket/socket.js';

type DbClient = typeof prisma | Prisma.TransactionClient;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}

export class NotificationService {
  static async create(input: NotificationInput, db: DbClient = prisma) {
    return db.notification.create({ data: input });
  }

  static async createAndEmit(input: NotificationInput, db: DbClient = prisma) {
    const notification = await this.create(input, db);
    // Call only after the surrounding transaction has committed. For tx clients,
    // callers must invoke emitCommittedNotification after commit.
    if (db === prisma) this.emitCommittedNotification(notification);
    return notification;
  }

  static emitCommittedNotification(notification: {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    createdAt: Date;
    readAt: Date | null;
  }) {
    emitToUser(notification.userId, 'notification.created', {
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null
      }
    });
  }
}
