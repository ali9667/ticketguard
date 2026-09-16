import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../infrastructure/database/prisma.js';
import { AppError } from '../utils/app-error.js';
import type { UserRole } from '@prisma/client';

interface AccessPayload extends jwt.JwtPayload { sub: string; role: UserRole; type: 'access' }

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED', 'Authentication is required.', 401);
    const token = header.slice(7);
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as AccessPayload;
    if (payload.type !== 'access' || typeof payload.sub !== 'string') throw new AppError('AUTH_INVALID_TOKEN', 'Invalid access token.', 401);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, status: true } });
    if (!user || user.status !== 'ACTIVE') throw new AppError('AUTH_ACCOUNT_SUSPENDED', 'Account is not active.', 401);
    req.auth = { userId: user.id, role: user.role, status: user.status };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) return next(new AppError('AUTH_TOKEN_EXPIRED', 'Access token has expired.', 401));
    if (error instanceof jwt.JsonWebTokenError) return next(new AppError('AUTH_INVALID_TOKEN', 'Invalid access token.', 401));
    next(error);
  }
};

export const requireRole = (...roles: UserRole[]): RequestHandler => (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) return next(new AppError('FORBIDDEN', 'You do not have permission to perform this action.', 403));
  next();
};
