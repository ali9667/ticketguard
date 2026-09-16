import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { z } from 'zod';

export const userRouter = Router();

const updateMeSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional()
}).refine(value => Object.keys(value).length > 0, { message: 'At least one profile field is required.' });

userRouter.use(requireAuth);

userRouter.get('/scanners', requireRole('EVENT_ORGANIZER', 'ADMIN'), async (_req, res, next) => {
  try {
    const scanners = await prisma.user.findMany({
      where: { role: 'SCANNER', status: 'ACTIVE' },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      take: 100,
    });
    res.json({ success: true, data: scanners });
  } catch (e) { next(e); }
});

userRouter.get('/me', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true, updatedAt: true } });
    if (!user) throw new AppError('RESOURCE_NOT_FOUND', 'User not found.', 404);
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

userRouter.patch('/me', validateBody(updateMeSchema), async (req, res, next) => {
  try {
    const updated = await prisma.user.update({ where: { id: req.auth!.userId }, data: req.body, select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true, updatedAt: true } });
    await AuditService.log({ actorId: updated.id, action: 'ADMIN_ACTION', resourceType: 'USER', resourceId: updated.id, requestId: res.locals.requestId, metadata: { event: 'PROFILE_UPDATED' } });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});
