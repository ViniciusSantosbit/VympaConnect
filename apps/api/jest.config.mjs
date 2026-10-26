export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.mjs'],
  testMatch: ['<rootDir>/test/**/*.test.mjs'],
  transform: {},
  collectCoverageFrom: ['dist/**/*.js', '!dist/generated/**'],
};
