import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { checkout, getOrder, listOrders, payOrder } from './order.controller.js';
import { checkoutSchema, orderIdSchema } from './order.schemas.js';

export const orderRouter = Router();
orderRouter.use(requireAuth);
orderRouter.get('/', listOrders);
orderRouter.get('/:id', validateParams(orderIdSchema), getOrder);
orderRouter.post('/checkout', validateBody(checkoutSchema), idempotent(), checkout);
orderRouter.post('/:id/pay', validateParams(orderIdSchema), idempotent(), payOrder);
