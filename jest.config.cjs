// Load environment variables before tests run
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envTestingPath = path.resolve(process.cwd(), '.env.testing');
if (fs.existsSync(envTestingPath)) {
  dotenv.config({ path: envTestingPath });
}

// Set default values for SQLite if not specified
if (!process.env.TEST_DATABASE_PROVIDER || process.env.TEST_DATABASE_PROVIDER === 'sqlite') {
  // SAFETY: Use TEST_DATABASE_URL for test database to avoid production conflicts
  process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:../db/test.db';
}

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
