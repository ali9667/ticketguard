import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { redisRateLimit } from '../../middleware/rate-limit.js';
import { idempotent } from '../../middleware/idempotency.js';
import { transferCreateSchema, transferIdSchema } from './transfer.schemas.js';
import { createTransfer, listTransfers, getTransfer, acceptTransfer, rejectTransfer, cancelTransfer } from './transfer.controller.js';

export const transferRouter = Router();
transferRouter.use(requireAuth);
transferRouter.post('/tickets/:id/transfers', redisRateLimit({ windowSeconds: 60, max: 10, prefix: 'rl:transfer-create' }), validateParams(transferIdSchema), validateBody(transferCreateSchema), idempotent(), createTransfer);
transferRouter.get('/transfers', listTransfers);
transferRouter.get('/transfers/:id', validateParams(transferIdSchema), getTransfer);
transferRouter.post('/transfers/:id/accept', validateParams(transferIdSchema), idempotent(), acceptTransfer);
transferRouter.post('/transfers/:id/reject', validateParams(transferIdSchema), idempotent(), rejectTransfer);
transferRouter.post('/transfers/:id/cancel', validateParams(transferIdSchema), idempotent(), cancelTransfer);
