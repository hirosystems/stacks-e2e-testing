/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 300_000,
  maxWorkers: 1,
  reporters: ["default", "jest-github-actions-reporter"],
  testLocationInResults: true,
};

export default config;
