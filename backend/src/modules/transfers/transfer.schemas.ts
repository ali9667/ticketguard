import { z } from 'zod';
export const transferCreateSchema=z.object({recipientEmail:z.string().email().max(320)});
export const transferIdSchema=z.object({id:z.string().uuid()});
