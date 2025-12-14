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
- Automatically loads environment variables from `.env` file using `dotenv`

### PostgreSQL Integration Tests
```bash
npm run test:postgres
```
- Real database tests using PostgreSQL
- Requires `DATABASE_URL` environment variable to be set
- Tests specific scenarios like nested create with arrays (createMany in disguise)
- Automatically loads environment variables from `.env` file using `dotenv`

### Run All Tests
```bash
npm test
```

## Environment Variables

This project uses `dotenv` to load environment variables from `.env` files. This is especially useful for MySQL integration tests.

### Setting Up Environment Variables

1. **Copy the example file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** with your database connection details:
   ```env
   DATABASE_URL="mysql://user:password@localhost:3306/testdb"
   ```

3. **Available `.env` files** (all are git-ignored):
   - `.env` - Default environment variables
   - `.env.local` - Local overrides (highest priority)
   - `.env.testing` - Testing-specific variables
   - `.env.development.local` - Development local overrides
   - `.env.test.local` - Test local overrides
   - `.env.production.local` - Production local overrides

### Environment Variable Priority

Environment variables are loaded in the following order (later files override earlier ones):
1. `.env`
2. `.env.local`
3. `.env.testing` (if NODE_ENV=testing)
4. `.env.development.local` (if NODE_ENV=development)
5. `.env.test.local` (if NODE_ENV=test)
6. System environment variables (highest priority)

**Note**: All `.env*` files are git-ignored to prevent committing sensitive credentials.

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

**Note**: MySQL tests require the `DATABASE_URL` environment variable to be set with a valid MySQL connection string. You can set this in your `.env` file (see [Environment Variables](#environment-variables) section above).

### PostgreSQL
```bash
# Generate Prisma client for PostgreSQL tests
npm run db:generate:postgres

# Push schema to PostgreSQL database
npm run db:push:postgres

# Setup everything (generate + push)
npm run db:setup:postgres
```

**Note**: PostgreSQL tests require the `DATABASE_URL` environment variable to be set with a valid PostgreSQL connection string. You can set this in your `.env` file (see [Environment Variables](#environment-variables) section above).

## CI/CD Considerations

In CI environments, the integration tests will:
1. Install dependencies (including Prisma CLI)
2. Download the appropriate query engine for the platform
3. Generate the test client
4. Create the SQLite database
5. Run the tests

No additional setup is required - everything is handled automatically by the npm scripts.