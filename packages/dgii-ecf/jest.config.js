module.exports = {
  clearMocks: true,
  testEnvironment: 'node',
  testTimeout: 60000,
  preset: 'ts-jest',
  transform: { '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: false }] },
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['jest-extended/all'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
