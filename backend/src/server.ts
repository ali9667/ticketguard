import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './infrastructure/database/prisma.js';
import { redis } from './infrastructure/redis/client.js';
import { logger } from './infrastructure/logging/logger.js';
import { createSocketServer, closeSocketServer } from './infrastructure/websocket/socket.js';
import { initializeQueues, closeQueues } from './infrastructure/queue/index.js';

const start = async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  await initializeQueues();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'TicketGuard API started');
  });
  createSocketServer(server);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown requested');
    await new Promise<void>(resolve => server.close(() => resolve()));
    await Promise.allSettled([
      closeSocketServer(),
      closeQueues(),
      prisma.$disconnect(),
      redis.quit()
    ]);
  };

  process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
};

start().catch(async error => {
  logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'TicketGuard startup failed');
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(1);
});
