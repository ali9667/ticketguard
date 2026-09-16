import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { redisRateLimit } from '../../middleware/rate-limit.js';
import { idempotent } from '../../middleware/idempotency.js';
import { AdminService } from './admin.service.js';
import { AppError } from '../../utils/app-error.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { z } from 'zod';

const userIdSchema = z.object({ id: z.string().uuid() });
const statusSchema = z.object({ status: z.enum(['ACTIVE','SUSPENDED']) }).strict();

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));
const adminLimit = redisRateLimit({ windowSeconds: 60, max: 120, prefix: 'rl:admin' });
adminRouter.get('/users', adminLimit, async (req,res,next)=>{ try { res.json({ success:true, data: await AdminService.listUsers(req.query) }); } catch(e){ next(e); } });
adminRouter.patch('/users/:id/status', adminLimit, validateParams(userIdSchema), validateBody(statusSchema), idempotent(), async (req,res,next)=>{ try { const status=req.body.status; if(status!=='ACTIVE' && status!=='SUSPENDED') throw new AppError('VALIDATION_ERROR','status must be ACTIVE or SUSPENDED.',400); const user=await AdminService.setUserStatus(req.auth!.userId,req.params.id as string,status,res.locals.requestId); res.json({success:true,data:user}); } catch(e){ next(e); } });
adminRouter.get('/audit-logs', adminLimit, async(req,res,next)=>{try{res.json({success:true,data:await AdminService.listAudit(req.query)});}catch(e){next(e);}});
adminRouter.get('/security-events', adminLimit, async(req,res,next)=>{try{res.json({success:true,data:await AdminService.listSecurity(req.query)});}catch(e){next(e);}});
adminRouter.get('/events', adminLimit, async(req,res,next)=>{try{res.json({success:true,data:await AdminService.listEvents(req.query)});}catch(e){next(e);}});
adminRouter.get('/tickets', adminLimit, async(req,res,next)=>{try{res.json({success:true,data:await AdminService.listTickets(req.query)});}catch(e){next(e);}});
