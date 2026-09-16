import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import { randomToken, hmacSha256 } from '../../utils/hash.js';
import type { LoginInput, RegisterInput } from './auth.types.js';
import type { Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { SecurityService } from '../audit/security.service.js';

const accessExpiresIn = env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'];

export class AuthService {
  static async register(input: RegisterInput, requestId: string) {
    const email = input.email.toLowerCase();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      return await prisma.$transaction(async tx => {
        const user = await tx.user.create({ data: { email, passwordHash, firstName: input.firstName, lastName: input.lastName } });
        await AuditService.log({ actorId: user.id, action: 'USER_REGISTERED', resourceType: 'USER', resourceId: user.id, requestId }, tx);
        return this.issueSession(user.id, user.role, tx);
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
        throw new AppError('AUTH_EMAIL_EXISTS', 'An account with this email already exists.', 409);
      }
      throw error;
    }
  }

  static async login(input: LoginInput, requestId: string, ipAddress?: string) {
    const email = input.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = !!user && user.status === 'ACTIVE' && await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      await AuditService.log({ actorId: user?.id, action: 'LOGIN_FAILED', resourceType: 'USER', resourceId: user?.id, requestId, metadata: { reason: 'INVALID_CREDENTIALS' } });
      await SecurityService.record({ actorId: user?.id, type: 'FAILED_LOGIN', severity: 'LOW', requestId, ...(ipAddress !== undefined ? { ipAddress } : {}), metadata: { reason: 'INVALID_CREDENTIALS' } });
      throw new AppError(user?.status === 'SUSPENDED' ? 'AUTH_ACCOUNT_SUSPENDED' : 'AUTH_INVALID_CREDENTIALS', user?.status === 'SUSPENDED' ? 'Account is suspended.' : 'Invalid email or password.', 401);
    }
    await AuditService.log({ actorId: user.id, action: 'LOGIN_SUCCESS', resourceType: 'USER', resourceId: user.id, requestId });
    return this.issueSession(user.id, user.role);
  }

  static async refresh(rawRefreshToken: string, requestId: string) {
    const tokenHash = hmacSha256(rawRefreshToken, env.JWT_REFRESH_SECRET);
    return prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; user_id: string; family_id: string; expires_at: Date; revoked_at: Date | null; role: UserRole; status: string }>>`
        SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at, u.role, u.status
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = ${tokenHash}
        FOR UPDATE OF rt
      `;
      const stored = rows[0];
      if (!stored) throw new AppError('AUTH_INVALID_REFRESH_TOKEN', 'Invalid or revoked refresh token.', 401);
      if (stored.revoked_at) {
        await tx.refreshToken.updateMany({ where: { familyId: stored.family_id, revokedAt: null }, data: { revokedAt: new Date() } });
        await SecurityService.record({ actorId: stored.user_id, type: 'REFRESH_TOKEN_REUSE', severity: 'HIGH', requestId, metadata: { familyId: stored.family_id } }, tx);
        throw new AppError('AUTH_REFRESH_TOKEN_REUSE', 'The refresh token has already been used or revoked.', 401);
      }
      if (stored.expires_at <= new Date() || stored.status !== 'ACTIVE') {
        throw new AppError('AUTH_INVALID_REFRESH_TOKEN', 'Invalid or revoked refresh token.', 401);
      }

      const nextToken = randomToken(48);
      const nextHash = hmacSha256(nextToken, env.JWT_REFRESH_SECRET);
      const nextId = randomUUID();
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), replacedBy: nextId } });
      await tx.refreshToken.create({ data: { id: nextId, userId: stored.user_id, tokenHash: nextHash, familyId: stored.family_id, expiresAt: this.expiryFromTtl(env.REFRESH_TOKEN_TTL) } });
      const accessToken = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { subject: stored.user_id, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, ...(accessExpiresIn !== undefined ? { expiresIn: accessExpiresIn } : {}) });
      await AuditService.log({ actorId: stored.user_id, action: 'LOGIN_SUCCESS', resourceType: 'REFRESH_TOKEN', resourceId: stored.id, requestId, metadata: { event: 'REFRESH' } }, tx);
      return { accessToken, refreshToken: nextToken };
    });
  }

  static async logout(rawRefreshToken: string) {
    await prisma.refreshToken.updateMany({ where: { tokenHash: hmacSha256(rawRefreshToken, env.JWT_REFRESH_SECRET), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string, requestId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true, status: true } });
    if (!user || user.status !== 'ACTIVE') throw new AppError('AUTH_ACCOUNT_SUSPENDED', 'Account is not active.', 401);
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new AppError('AUTH_INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.log({ actorId: userId, action: 'PASSWORD_CHANGED', resourceType: 'USER', resourceId: userId, requestId }, tx);
    });
  }

  private static async issueSession(userId: string, role: UserRole, db: typeof prisma | Prisma.TransactionClient = prisma) {
    const refreshToken = randomToken(48);
    await db.refreshToken.create({ data: { userId, tokenHash: hmacSha256(refreshToken, env.JWT_REFRESH_SECRET), familyId: randomUUID(), expiresAt: this.expiryFromTtl(env.REFRESH_TOKEN_TTL) } });
    const accessToken = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { subject: userId, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, ...(accessExpiresIn !== undefined ? { expiresIn: accessExpiresIn } : {}) });
    return { accessToken, refreshToken };
  }

  private static expiryFromTtl(ttl: string): Date {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error('Unsupported TTL format. Use values such as 15m or 7d.');
    const amount = Number(match[1]);
    const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return new Date(Date.now() + amount * multiplier);
  }
}
