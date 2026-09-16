import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Redis = require('ioredis') as typeof import('ioredis').default;
import { env } from '../../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});
