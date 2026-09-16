import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { redisRateLimit } from '../../middleware/rate-limit.js';
import { register, login, refresh, logout, changePassword } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { registerSchema, loginSchema, refreshSchema, changePasswordSchema } from './auth.schemas.js';

export const authRouter = Router();
const authLimit = redisRateLimit({ windowSeconds: 60, max: 10, prefix: 'rl:auth' });
authRouter.post('/register', authLimit, validateBody(registerSchema), register);
authRouter.post('/login', authLimit, validateBody(loginSchema), login);
authRouter.post('/refresh', validateBody(refreshSchema), refresh);
authRouter.post('/logout', validateBody(refreshSchema), logout);

authRouter.post('/change-password', requireAuth, redisRateLimit({ windowSeconds: 300, max: 5, prefix: 'rl:password-change' }), validateBody(changePasswordSchema), changePassword);
