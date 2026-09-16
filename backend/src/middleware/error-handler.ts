import type { ErrorRequestHandler } from 'express';
import { logger } from '../infrastructure/logging/logger.js';
import { AppError } from '../utils/app-error.js';

type IdempotencyFinalize = (status: number, body?: unknown) => Promise<void>;

export const errorHandler: ErrorRequestHandler = async (error, _req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const responseBody = error instanceof AppError
    ? {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
        requestId,
      }
    : {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred.',
        },
        requestId,
      };

  const finalize = res.locals.idempotencyFinalize as IdempotencyFinalize | undefined;
  if (finalize) {
    await finalize(statusCode, responseBody).catch((finalizeError: unknown) => {
      logger.error({ err: finalizeError, requestId }, 'Failed to finalize idempotency record');
    });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) logger.error({ err: error, requestId }, error.message);
    else logger.warn({ code: error.code, statusCode: error.statusCode, requestId }, error.message);
    res.status(error.statusCode).json(responseBody);
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled request error');
  res.status(500).json(responseBody);
};
