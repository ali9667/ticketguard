import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateParams } from '../../middleware/validate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { ticketIdSchema } from './ticket.schemas.js';
import { issueTickets, listTickets, getTicket, cancelTicket } from './ticket.controller.js';

export const ticketRouter = Router();
ticketRouter.use(requireAuth);
ticketRouter.get('/', listTickets);
ticketRouter.get('/:id', validateParams(ticketIdSchema), getTicket);
ticketRouter.post('/:id/cancel', validateParams(ticketIdSchema), idempotent(), cancelTicket);
export { issueTickets };
