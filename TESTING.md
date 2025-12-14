# Testing Guide

This document provides comprehensive information about the testing infrastructure for prisma-prefixed-ids.

## Test Structure

The project includes two types of tests:

1. **Unit Tests** (`tests/index.test.ts`) - 65 tests
   - Fast, no database required
   - Test core functionality and edge cases
   - Mock nanoid for deterministic results

2. **Integration Tests** (`tests/integration.test.ts`) - 35 tests
   - Real database operations
   - Support for SQLite, PostgreSQL, and MySQL
   - Comprehensive transaction testing

## Running Tests

### Quick Start (SQLite - Default)

```bash
npm test              # Run all tests (unit + integration)
npm run test:unit     # Run only unit tests
npm run test:integration  # Run only integration tests
```

### PostgreSQL Testing

1. **Start a PostgreSQL database:**

```bash
# Using Docker (recommended)
docker run --name postgres-test \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=prisma_test \
  -p 5432:5432 -d postgres:15

# Or use your local PostgreSQL
createdb prisma_test
```

2. **Create `.env.testing` file:**

```env
TEST_DATABASE_PROVIDER=postgresql
TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/prisma_test"
```

> **⚠️ SAFETY NOTE**: We use `TEST_DATABASE_URL` instead of `DATABASE_URL` to prevent accidentally running tests against production databases. The setup script will also warn you if the database name doesn't contain "test" or "dev".

3. **Run tests:**

```bash
npm test
# or
npm run test:integration:pg  # Specifically run with PostgreSQL
```

## Database Configuration

### Environment Variables

- `TEST_DATABASE_PROVIDER`: Set to `sqlite` (default), `postgresql`, or `mysql`
- `TEST_DATABASE_URL`: Database connection string
  - **SQLite**: Defaults to `file:../db/test.db` (auto-configured)
  - **PostgreSQL**: Required, e.g., `postgresql://user:pass@localhost:5432/test_db`
  - **MySQL**: Required, e.g., `mysql://user:pass@localhost:3306/test_db`

### Safety Features

The test setup includes several safety features to prevent production database issues:

1. **Dedicated test variables**: Uses `TEST_DATABASE_PROVIDER` and `TEST_DATABASE_URL` (never `DATABASE_URL`)
2. **No fallback to production**: Will fail if `TEST_DATABASE_URL` is not set for PostgreSQL/MySQL
3. **Database name validation**: Warns if database name doesn't contain "test" or "dev"
4. **Explicit configuration**: Requires explicit `.env.testing` file for PostgreSQL and MySQL
5. **Automatic cleanup**: Database is reset before each test run

## Test Database Setup

The database setup is handled automatically by `tests/setup-db.mjs`:

1. **Load environment** from `.env.testing` (if exists)
2. **Generate schema** with correct provider from base `schema.prisma`
3. **Reset database**:
   - SQLite: Delete `test.db` file
   - PostgreSQL/MySQL: Run `prisma migrate reset`
4. **Generate Prisma Client** with correct provider
5. **Push schema** to database

> **Note**: Prisma doesn't support `env("PROVIDER")` in the datasource provider field. As a workaround, we use a template approach:
> - `schema.prisma` contains `provider = "__PROVIDER__"` as a placeholder
> - `setup-db.mjs` generates `.schema.generated.prisma` with the actual provider
> - This keeps maintenance simple with just one source schema file

### Manual Database Setup

If you need to manually set up the database:

```bash
npm run db:setup
```

## Transaction Tests

The integration tests include comprehensive transaction testing (14 tests):

- ✅ Single and multiple creates within transactions
- ✅ Nested creates and complex relationships
- ✅ CreateMany bulk operations
- ✅ Large batch operations (100 records)
- ✅ Transaction rollback scenarios
- ✅ Upsert and mixed operations
- ✅ Manual ID preservation in transactions
- ✅ **Bug reproduction tests** for incorrect usage patterns

### Transaction Usage Patterns

**✅ CORRECT - Use extended client for transaction:**

```typescript
await extendedPrisma.$transaction(async (tx) => {
  const user = await tx.user.create({ ... });
  const post = await tx.post.create({ ... });
});
```

**❌ WRONG - Will hang/timeout:**

```typescript
await prisma.$transaction(async (tx) => {
  const user = await extendedPrisma.user.create({ ... });
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test-sqlite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test  # Uses SQLite by default

  test-postgresql:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: prisma_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - name: Create .env.testing
        run: |
          echo "TEST_DATABASE_PROVIDER=postgresql" >> .env.testing
          echo 'TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prisma_test"' >> .env.testing
      - run: npm test
```

## Development Workflow

### Quick Iteration (SQLite)

For rapid development, use SQLite (default):

```bash
npm run test:watch  # Watch mode for quick iterations
```

### Thorough Testing (PostgreSQL)

Before committing, test against PostgreSQL:

```bash
# Set up PostgreSQL once
docker-compose up -d postgres-test  # if using docker-compose

# Create .env.testing
echo "TEST_DATABASE_PROVIDER=postgresql" > .env.testing
echo 'TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/prisma_test"' >> .env.testing

# Run tests
npm test
```

### Debugging Tests

```bash
# Run specific test file
npm test -- tests/integration.test.ts

# Run specific test by name
npm test -- --testNamePattern="transaction"

# Run with verbose output
npm test -- --verbose
```

## Test Coverage

Generate code coverage report:

```bash
npm run test:coverage
```

Coverage reports will be generated in the `coverage/` directory.

## Troubleshooting

### Tests hanging

**Symptom**: Tests timeout or hang indefinitely

**Causes**:
1. Using wrong transaction pattern (see Transaction Usage Patterns above)
2. Database connection issues
3. `TEST_DATABASE_URL` not set for PostgreSQL tests

**Solutions**:
- Verify transaction usage pattern
- Check database is running: `docker ps` or `pg_isready`
- Verify `.env.testing` configuration

### PostgreSQL/MySQL connection errors

**Symptom**: `Error: connect ECONNREFUSED` or `TEST_DATABASE_URL must be set`

**Solutions**:
- Ensure the database server is running
- Check port (PostgreSQL: 5432, MySQL: 3306) is not in use
- Verify credentials in `TEST_DATABASE_URL`
- Ensure `.env.testing` file exists with `TEST_DATABASE_URL` set
- **Never use `DATABASE_URL`** - only `TEST_DATABASE_URL` will work

### Schema mismatch errors

**Symptom**: `Prisma schema validation errors`

**Solutions**:
```bash
# Regenerate Prisma Client
npm run db:setup

# Or manually
npm run db:generate
npm run db:push
```

### Tests fail after switching databases

**Symptom**: Tests pass with SQLite but fail with PostgreSQL (or vice versa)

**Solutions**:
- Ensure database is clean: `npm run db:setup`
- Check for database-specific SQL in your code
- Verify schema compatibility between providers

## Adding New Tests

When adding new integration tests:

1. **Clean up after yourself**: Use `beforeEach` to reset data
2. **Test both databases**: Ensure tests pass with SQLite and PostgreSQL
3. **Use proper transaction patterns**: Follow the examples in existing tests
4. **Handle async properly**: Always `await` database operations
5. **Add to relevant describe block**: Organize tests logically

Example:

```typescript
describe('New Feature', () => {
  it('should work correctly', async () => {
    const result = await extendedPrisma.model.create({
      data: { /* ... */ },
    });

    expect(result.id).toMatch(/^prefix_/);

    // Clean up is handled by beforeEach
  });
});
```

## Performance Considerations

- **SQLite**: Fastest for local development, ~8 seconds for full suite
- **PostgreSQL**: More thorough, ~10-12 seconds for full suite
- **MySQL**: Similar to PostgreSQL, ~10-12 seconds for full suite
- **Parallel tests**: Not currently supported (shared database state)
- **Transaction tests**: Include 2-second timeouts for hang detection

## Best Practices

1. **Local development**: Use SQLite for speed
2. **Pre-commit**: Run tests against your production database type (PostgreSQL/MySQL)
3. **CI/CD**: Test all databases in parallel jobs
4. **Dedicated test environment variables**: Always use `TEST_DATABASE_*` variables, never `DATABASE_URL`
5. **Name test databases**: Include "test" or "dev" in database names for safety
6. **Clean state**: Tests should not depend on each other's state
7. **Explicit assertions**: Test both success and failure cases
8. **Fail-safe design**: Tests will error if PostgreSQL/MySQL is configured without proper `TEST_DATABASE_URL`
