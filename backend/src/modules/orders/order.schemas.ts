import { z } from 'zod';

export const checkoutSchema = z.object({
  items: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(20),
}).strict();

export const orderIdSchema = z.object({ id: z.string().uuid() });
