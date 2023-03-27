/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};
