import type { Request } from 'express';
import type { UserRole, UserStatus } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: UserRole; status: UserStatus };
    }
  }
}

export type AuthenticatedRequest = Request & {
  auth: NonNullable<Request['auth']>;
};
