import type { RequestHandler, Response } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../infrastructure/database/prisma.js';
import { AppError } from '../utils/app-error.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9._~-]{8,255}$/;

type Finalize = (status: number, body?: unknown) => Promise<void>;

const installFinalizer = (res: Response, id: string): Finalize => {
  let finalized = false;

  const finalize: Finalize = async (status, body) => {
    if (finalized) {
      return;
    }

    finalized = true;

    await prisma.idempotencyKey.update({
      where: { id },
      data: {
        status: status >= 500 ? 'FAILED' : 'COMPLETED',
        responseStatus: status,
        ...(body !== undefined
          ? { responseBody: body as object }
          : {}),
        updatedAt: new Date(),
      },
    });
  };

  res.locals.idempotencyFinalize = finalize;

  return finalize;
};

export const idempotent = (): RequestHandler => async (
  req,
  res,
  next,
) => {
  const key = req.header('Idempotency-Key');

  if (!key) {
    return next(
      new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header is required for this operation.',
        400,
      ),
    );
  }

  if (!KEY_PATTERN.test(key)) {
    return next(
      new AppError(
        'IDEMPOTENCY_KEY_INVALID',
        'Idempotency-Key must contain 8-255 URL-safe characters.',
        400,
      ),
    );
  }

  if (!req.auth?.userId) {
    return next(
      new AppError(
        'AUTH_REQUIRED',
        'Authentication is required for idempotent operations.',
        401,
      ),
    );
  }

  const requestHash = createHash('sha256')
    .update(
      `${req.method}\n${req.originalUrl}\n${JSON.stringify(
        req.body ?? {},
      )}`,
    )
    .digest('hex');

  const identity = {
    key,
    userId: req.auth.userId,
    method: req.method,
    route: req.originalUrl,
  };

  try {
    let record = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_route: identity,
      },
    });

    /*
     * Track whether THIS request created the idempotency record.
     *
     * This is critical:
     *
     * A newly-created record is PROCESSING because this request owns it.
     * It must NOT be rejected as "already being processed".
     */
    let created = false;

    /*
     * Remove expired records.
     */
    if (record && record.expiresAt <= new Date()) {
      await prisma.idempotencyKey
        .delete({
          where: { id: record.id },
        })
        .catch(() => undefined);

      record = null;
    }

    /*
     * Try to create the idempotency record.
     */
    if (!record) {
      try {
        record = await prisma.idempotencyKey.create({
          data: {
            ...identity,
            requestHash,
            status: 'PROCESSING',
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        });

        /*
         * We successfully created the record.
         * Therefore this request owns the PROCESSING state.
         */
        created = true;
      } catch (error) {
        /*
         * Another concurrent request may have created the
         * same idempotency key between findUnique() and create().
         */
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          (error as { code?: string }).code !== 'P2002'
        ) {
          throw error;
        }

        record = await prisma.idempotencyKey.findUnique({
          where: {
            key_userId_method_route: identity,
          },
        });
      }
    }

    if (!record) {
      throw new AppError(
        'IDEMPOTENCY_ERROR',
        'Unable to establish idempotency state.',
        500,
      );
    }

    /*
     * Same key + different request body is never allowed.
     */
    if (record.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'The same idempotency key was used with a different request.',
        409,
      );
    }

    /*
     * If the request already completed/failed and we have a
     * stored response, replay that exact response.
     */
    if (
      (record.status === 'COMPLETED' ||
        record.status === 'FAILED') &&
      record.responseBody !== null &&
      record.responseStatus !== null
    ) {
      res
        .status(record.responseStatus)
        .json(record.responseBody);

      return;
    }

    /*
     * IMPORTANT:
     *
     * Only reject PROCESSING when the record existed BEFORE
     * this request.
     *
     * Without `!created`, a newly-created PROCESSING record
     * immediately rejects itself.
     */
    if (!created && record.status === 'PROCESSING') {
      const staleBefore = new Date(
        Date.now() - PROCESSING_TIMEOUT_MS,
      );

      /*
       * Existing request appears stale.
       *
       * Atomically attempt to reclaim it.
       */
      if (record.updatedAt < staleBefore) {
        const reclaimed =
          await prisma.idempotencyKey.updateMany({
            where: {
              id: record.id,
              status: 'PROCESSING',
              updatedAt: record.updatedAt,
            },
            data: {
              updatedAt: new Date(),
            },
          });

        if (reclaimed.count !== 1) {
          throw new AppError(
            'IDEMPOTENCY_IN_PROGRESS',
            'The same request is already being processed.',
            409,
          );
        }
      } else {
        throw new AppError(
          'IDEMPOTENCY_IN_PROGRESS',
          'The same request is already being processed.',
          409,
        );
      }
    }

    /*
     * Install response finalization.
     */
    const finalize = installFinalizer(res, record.id);

    const originalJson = res.json.bind(res);

    /*
     * Persist normal JSON responses.
     */
    res.json = ((body: unknown) => {
      const status = res.statusCode;

      void finalize(status, body).catch(() => undefined);

      return originalJson(body);
    }) as typeof res.json;

    /*
     * Fallback for responses that don't go through res.json().
     */
    res.once('finish', () => {
      if (!res.locals.idempotencyFinalized) {
        void finalize(res.statusCode).catch(() => undefined);
      }
    });

    /*
     * Allow controllers/services to explicitly finalize the
     * idempotency record.
     */
    res.locals.idempotencyFinalized = false;

    const originalFinalize = finalize;

    res.locals.idempotencyFinalize = async (
      status: number,
      body?: unknown,
    ) => {
      res.locals.idempotencyFinalized = true;

      await originalFinalize(status, body);
    };

    /*
     * Continue to the actual controller.
     */
    return next();
  } catch (error) {
    return next(error);
  }
};