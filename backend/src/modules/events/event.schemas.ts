import { z } from 'zod';

const isoDate = z.coerce.date();

export const createEventSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  venue: z.object({
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(100),
    country: z.string().trim().min(1).max(100),
  }),
  startAt: isoDate,
  endAt: isoDate,
  timezone: z.string().trim().min(1).max(100),
  capacity: z.number().int().positive().max(1_000_000),
}).superRefine((value, ctx) => {
  if (value.endAt <= value.startAt) {
    ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'endAt must be after startAt' });
  }
});

export const updateEventSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  startAt: isoDate.optional(),
  endAt: isoDate.optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  capacity: z.number().int().positive().max(1_000_000).optional(),
  venue: z.object({
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(100),
    country: z.string().trim().min(1).max(100),
  }).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.startAt && value.endAt && value.endAt <= value.startAt) {
    ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'endAt must be after startAt' });
  }
});

export const ticketTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().finite().nonnegative().max(9_999_999_999.99),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code').transform((value) => value.toUpperCase()),
  quantity: z.number().int().positive().max(1_000_000),
});

export const updateTicketTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  price: z.number().finite().nonnegative().max(9_999_999_999.99).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code').transform((value) => value.toUpperCase()).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

export const scannerAssignmentSchema = z.object({ scannerId: z.string().uuid() });
export const idParamSchema = z.object({ id: z.string().uuid() });
export const eventIdSchema = z.object({ eventId: z.string().uuid() });
export const ticketTypeIdParamSchema = z.object({ id: z.string().uuid(), ticketTypeId: z.string().uuid() });
