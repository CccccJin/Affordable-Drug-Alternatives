/**
 * ts-jest in ESM mode, because the source uses `import.meta.env.BASE_URL` to
 * build asset URLs the way Vite expects. Running the tests through the CommonJS
 * transform would make that a syntax error.
 *
 * `npm test` sets NODE_OPTIONS=--experimental-vm-modules, which Jest needs to
 * load ES modules at all.
 */
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEach: undefined,
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { useESM: true, tsconfig: '<rootDir>/tsconfig.jest.json' },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // ESM-style relative imports carry a .js suffix that does not exist on disk.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
  ],
};
