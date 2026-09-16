import config from './jest.config.mjs';

export default { ...config, testMatch: ['<rootDir>/tests/concurrency/**/*.test.ts'] };
