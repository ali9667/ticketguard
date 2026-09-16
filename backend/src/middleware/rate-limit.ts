import type { RequestHandler } from 'express';
import { redis } from '../infrastructure/redis/client.js';
import { AppError } from '../utils/app-error.js';
import { SecurityService } from '../modules/audit/security.service.js';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export const redisRateLimit = (options: { windowSeconds: number; max: number; prefix: string }): RequestHandler => async (req, res, next) => {
  try {
    const identity = req.auth?.userId ?? req.ip ?? 'anonymous';
    const key = `${options.prefix}:${identity}`;
    const [rawCount, rawTtl] = (await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      options.windowSeconds
    )) as [number, number];

    const count = Number(rawCount);
    const ttl = Number(rawTtl);
    const remaining = Math.max(0, options.max - count);

    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    if (ttl > 0) res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

    if (count > options.max) {
      if (ttl > 0) res.setHeader('Retry-After', ttl);
      void SecurityService.record({
        actorId: req.auth?.userId,
        type: 'EXCESSIVE_REQUESTS',
        severity: 'LOW',
        requestId: res.locals.requestId,
        ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
        metadata: { limiter: options.prefix }
      }).catch(() => undefined);
      return next(new AppError('RATE_LIMITED', 'Too many requests. Please retry later.', 429));
    }
    next();
  } catch (error) {
    next(error);
  }
};
