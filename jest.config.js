/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 300_000,
  maxWorkers: 5,
  reporters: ["default", "jest-github-actions-reporter"],
  testLocationInResults: true,
};
