import config from './jest.config.mjs';

export default { ...config, testMatch: ['<rootDir>/tests/security/**/*.test.ts'] };
