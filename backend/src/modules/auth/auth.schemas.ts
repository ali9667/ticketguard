import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) });
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(1000).optional() });

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).refine(v => v.currentPassword !== v.newPassword, { message: 'New password must differ from current password.' });
