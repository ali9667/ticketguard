import {z} from 'zod';
export const verifySchema=z.object({credential:z.string().min(10).max(500)});
