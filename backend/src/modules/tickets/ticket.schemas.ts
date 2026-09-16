import { z } from 'zod';

export const issueTicketSchema = z.object({ ticketTypeId: z.string().uuid(), ownerId: z.string().uuid(), quantity: z.number().int().min(1).max(100) });
export const ticketIdSchema = z.object({ id: z.string().uuid() });
export const eventIdSchema = z.object({ eventId: z.string().uuid() });
