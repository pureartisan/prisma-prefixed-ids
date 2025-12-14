# Development Guide

## Running Tests

This project has two types of tests:

### Unit Tests
```bash
npm run test:unit
```
- Fast, mocked tests
- No database required
- Tests the core logic and extension functionality

### Integration Tests
```bash
npm run test:integration
```
- Real database tests using SQLite
- Automatically downloads Prisma query engine and sets up database
- Tests end-to-end functionality with actual database operations

### MySQL Integration Tests
```bash
npm run test:mysql
```
- Real database tests using MySQL
- Requires `DATABASE_URL` environment variable to be set
- Tests specific scenarios like nested create with arrays (createMany in disguise)
- Example: `DATABASE_URL="mysql://user:password@localhost:3306/testdb" npm run test:mysql`

### Run All Tests
```bash
npm test
```

## Database Setup for Integration Tests

The integration tests use a real SQLite database. The required files are automatically generated when you run integration tests:

- `test-client/` - Generated Prisma client
- `prisma/test.db` - SQLite database file
- Query engine binaries

These files are excluded from git and created on-demand to keep the repository lightweight.

## Manual Database Commands

### SQLite (default)
```bash
# Generate Prisma client for tests
npm run db:generate

# Push schema to test database
npm run db:push

# Reset test database
npm run db:reset

# Setup everything (generate + push)
npm run db:setup
```

### MySQL
```bash
# Generate Prisma client for MySQL tests
npm run db:generate:mysql

# Push schema to MySQL database
npm run db:push:mysql

# Setup everything (generate + push)
npm run db:setup:mysql
```

**Note**: MySQL tests require the `DATABASE_URL` environment variable to be set with a valid MySQL connection string.

## CI/CD Considerations

In CI environments, the integration tests will:
1. Install dependencies (including Prisma CLI)
2. Download the appropriate query engine for the platform
3. Generate the test client
4. Create the SQLite database
5. Run the tests

No additional setup is required - everything is handled automatically by the npm scripts.