import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/app-error.js';

export const validateBody = (schema: z.ZodType): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(new AppError('VALIDATION_ERROR', 'Request body is invalid.', 400, result.error.flatten()));
  req.body = result.data;
  next();
};

export const validateParams = (schema: z.ZodType): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) return next(new AppError('VALIDATION_ERROR', 'Route parameters are invalid.', 400, result.error.flatten()));
  req.params = result.data as typeof req.params;
  next();
};
