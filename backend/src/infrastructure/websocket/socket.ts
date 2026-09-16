import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../database/prisma.js';
import type { UserRole } from '@prisma/client';

interface AccessPayload extends jwt.JwtPayload { sub: string; type: 'access' }

let io: Server | undefined;

export const createSocketServer = (server: HttpServer) => {
  io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    transports: ['websocket', 'polling']
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined;
      if (!token) return next(new Error('AUTH_REQUIRED'));

      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE
      }) as AccessPayload;
      if (payload.type !== 'access' || typeof payload.sub !== 'string') {
        return next(new Error('AUTH_INVALID_TOKEN'));
      }

      // Role/status are loaded from the database. JWT role claims are never used
      // as the authorization source of truth for socket connections.
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true, role: true }
      });
      if (!user) return next(new Error('AUTH_INVALID_TOKEN'));
      if (user.status !== 'ACTIVE') return next(new Error('AUTH_ACCOUNT_SUSPENDED'));

      socket.data.userId = user.id;
      socket.data.role = user.role as UserRole;
      next();
    } catch {
      next(new Error('AUTH_INVALID_TOKEN'));
    }
  });

  io.on('connection', socket => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.emit('connection.ready', { userId });
  });

  return io;
};

export const emitToUser = (userId: string, event: string, payload: unknown) => {
  io?.to(`user:${userId}`).emit(event, payload);
};

export const isSocketServerReady = () => io !== undefined;

export const closeSocketServer = async () => {
  if (!io) return;
  await new Promise<void>(resolve => io!.close(() => resolve()));
  io = undefined;
};
