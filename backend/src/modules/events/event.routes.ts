import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { redisRateLimit } from '../../middleware/rate-limit.js';
import {
  createEventSchema,
  updateEventSchema,
  idParamSchema,
  ticketTypeSchema,
  updateTicketTypeSchema,
  scannerAssignmentSchema,
  ticketTypeIdParamSchema,
} from './event.schemas.js';
import {
  createEvent,
  updateEvent,
  publishEvent,
  cancelEvent,
  createTicketType,
  updateTicketType,
  assignScanner,
  listEventScanners,
  removeScanner,
  listMyEvents,
  listEvents,
  getEvent,
} from './event.controller.js';
import { issueTickets } from '../tickets/ticket.controller.js';
import { issueTicketSchema, eventIdSchema } from '../tickets/ticket.schemas.js';

export const eventRouter = Router();

eventRouter.get('/', redisRateLimit({ windowSeconds: 60, max: 120, prefix: 'rl:events-public' }), listEvents);
eventRouter.get('/mine/list', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), listMyEvents);
eventRouter.get('/:id', validateParams(idParamSchema), getEvent);

eventRouter.post('/', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateBody(createEventSchema), idempotent(), createEvent);
eventRouter.patch('/:id', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(idParamSchema), validateBody(updateEventSchema), idempotent(), updateEvent);
eventRouter.post('/:id/publish', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(idParamSchema), idempotent(), publishEvent);
eventRouter.post('/:id/cancel', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(idParamSchema), idempotent(), cancelEvent);
eventRouter.get('/:id/scanners', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(idParamSchema), listEventScanners);
eventRouter.post('/:id/scanners', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(idParamSchema), validateBody(scannerAssignmentSchema), idempotent(), assignScanner);
eventRouter.delete('/:id/scanners/:scannerId', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(z.object({ id: z.string().uuid(), scannerId: z.string().uuid() })), idempotent(), removeScanner);
eventRouter.post('/:id/ticket-types', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(idParamSchema), validateBody(ticketTypeSchema), idempotent(), createTicketType);
eventRouter.patch('/:id/ticket-types/:ticketTypeId', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(ticketTypeIdParamSchema), validateBody(updateTicketTypeSchema), idempotent(), updateTicketType);
eventRouter.post('/:eventId/tickets', requireAuth, requireRole('EVENT_ORGANIZER', 'ADMIN'), validateParams(eventIdSchema), validateBody(issueTicketSchema), idempotent(), issueTickets);
