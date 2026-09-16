import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';

describe('authentication and authorization against PostgreSQL', () => {
  const suffix = randomUUID();
  const password = 'TicketGuard-Test-2026!';
  let userId: string;
  let firstRefresh: string;

  afterAll(async () => { await prisma.user.deleteMany({ where: { id: userId } }); await prisma.$disconnect(); });

  test('registration persists a user and issues a session', async () => {
    const session = await AuthService.register({ email: `auth-${suffix}@test.local`, password, firstName: 'Auth', lastName: 'Test' }, `register-${suffix}`);
    firstRefresh = session.refreshToken;
    const user = await prisma.user.findUnique({ where: { email: `auth-${suffix}@test.local` } });
    userId = user!.id;
    expect(user?.passwordHash).not.toBe(password);
    expect(session.accessToken).toEqual(expect.any(String));
  });

  test('refresh rotation invalidates the old token and detects replay', async () => {
    const rotated = await AuthService.refresh(firstRefresh, `refresh-${suffix}`);
    expect(rotated.refreshToken).not.toBe(firstRefresh);
    await expect(AuthService.refresh(firstRefresh, `replay-${suffix}`)).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_REUSE' });
    const activeFamily = await prisma.refreshToken.count({ where: { userId, revokedAt: null } });
    expect(activeFamily).toBe(0);
  });

  test('password change revokes all remaining sessions', async () => {
    const session = await AuthService.login({ email: `auth-${suffix}@test.local`, password }, `login-${suffix}`);
    await AuthService.changePassword(userId, password, 'TicketGuard-Test-2026-New!', `password-${suffix}`);
    await expect(AuthService.refresh(session.refreshToken, `revoked-${suffix}`)).rejects.toThrow();
  });
});
