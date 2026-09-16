import {Router} from 'express';
import {requireAuth,requireRole} from '../../middleware/auth.js';
import {redisRateLimit} from '../../middleware/rate-limit.js';
import {idempotent} from '../../middleware/idempotency.js';
import {validateBody} from '../../middleware/validate.js';
import {verifySchema} from './verification.schemas.js';
import {verifyTicket} from './verification.controller.js';
export const verificationRouter=Router();
verificationRouter.post('/ticket',requireAuth,requireRole('SCANNER','ADMIN'),redisRateLimit({windowSeconds:60,max:60,prefix:'rl:verify'}),idempotent(),validateBody(verifySchema),verifyTicket);
