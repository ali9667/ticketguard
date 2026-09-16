import { Router } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/redis/client.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok' }
  });
});

healthRouter.get('/health/ready', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisStatus = await redis.ping();

    if (redisStatus !== 'PONG') {
      res.status(503).json({
        success: false,
        error: { code: 'REDIS_UNAVAILABLE', message: 'Redis is not ready.' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { status: 'ready', dependencies: { postgres: 'ok', redis: 'ok' } }
    });
  } catch (error) {
    res.status(503).json({ success: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'A required service is unavailable.' } });
  }
});
