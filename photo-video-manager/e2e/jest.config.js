module.exports = {
  maxWorkers: 1,
  testTimeout: 120000,
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': 'babel-jest' },
  reporters: ['detox/runners/jest/reporter'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
