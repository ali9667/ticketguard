import type { RequestHandler } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { emitToUser } from '../../infrastructure/websocket/socket.js';

export const listNotifications: RequestHandler = async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 50;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const rows = await prisma.notification.findMany({
      where: { userId: req.auth!.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    res.json({
      success: true,
      data,
      meta: { nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null }
    });
  } catch (e) { next(e); }
};

export const readNotification: RequestHandler = async (req, res, next) => {
  try {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id as string } });
    if (!n) throw new AppError('RESOURCE_NOT_FOUND', 'Notification not found.', 404);
    if (n.userId !== req.auth!.userId) throw new AppError('FORBIDDEN', 'You cannot modify this notification.', 403);
    const updated = await prisma.notification.update({ where: { id: n.id }, data: { readAt: n.readAt ?? new Date() } });
    emitToUser(req.auth!.userId, 'notification.read', { notificationId: updated.id, readAt: updated.readAt?.toISOString() ?? null });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
};
