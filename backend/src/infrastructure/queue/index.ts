import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../../config/env.js';
import { TransferService } from '../../modules/transfers/transfer.service.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../logging/logger.js';

const connection = { url: env.REDIS_URL };
const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 }
};

export const transferExpiryQueue = new Queue('ticketguard-transfer-expiry', { connection, defaultJobOptions });
export const maintenanceQueue = new Queue('ticketguard-maintenance', { connection, defaultJobOptions });

let transferExpiryWorker: Worker | undefined;
let maintenanceWorker: Worker | undefined;
let initialized = false;

const attachWorkerLogging = (worker: Worker) => {
  worker.on('failed', (job: Job | undefined, error: Error) => {
    logger.error({ queue: worker.name, jobId: job?.id, jobName: job?.name, error: error.message }, 'Background job failed');
  });
  worker.on('error', error => {
    logger.error({ queue: worker.name, error: error.message }, 'Background worker error');
  });
};

export async function initializeQueues() {
  if (initialized) return;
  await Promise.all([transferExpiryQueue.waitUntilReady(), maintenanceQueue.waitUntilReady()]);
  await transferExpiryQueue.upsertJobScheduler(
    'expire-pending-transfers',
    { every: 60_000 },
    { name: 'expire-pending-transfers', data: {} }
  );
  await maintenanceQueue.upsertJobScheduler(
    'cleanup-idempotency',
    { every: 15 * 60_000 },
    { name: 'cleanup-idempotency', data: {} }
  );

  transferExpiryWorker = new Worker(
    transferExpiryQueue.name,
    async () => TransferService.expirePending(),
    { connection, concurrency: 2 }
  );
  maintenanceWorker = new Worker(
    maintenanceQueue.name,
    async job => {
      if (job.name !== 'cleanup-idempotency') throw new Error(`Unknown maintenance job: ${job.name}`);
      await prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    },
    { connection, concurrency: 1 }
  );
  attachWorkerLogging(transferExpiryWorker);
  attachWorkerLogging(maintenanceWorker);
  await Promise.all([transferExpiryWorker.waitUntilReady(), maintenanceWorker.waitUntilReady()]);
  initialized = true;
  logger.info('Background queues initialized');
}

export async function closeQueues() {
  await Promise.allSettled([
    transferExpiryWorker?.close(),
    maintenanceWorker?.close(),
    transferExpiryQueue.close(),
    maintenanceQueue.close()
  ]);
  transferExpiryWorker = undefined;
  maintenanceWorker = undefined;
  initialized = false;
}
