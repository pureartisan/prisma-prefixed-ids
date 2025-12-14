# Prisma Prefixed IDs

[![npm version](https://img.shields.io/npm/v/prisma-prefixed-ids.svg)](https://www.npmjs.com/package/prisma-prefixed-ids)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/pureartisan/prisma-prefixed-ids/actions/workflows/ci.yml/badge.svg)](https://github.com/pureartisan/prisma-prefixed-ids/actions/workflows/ci.yml)

A Prisma extension that automatically adds prefixed IDs to your models. This package allows you to configure custom prefixes for your models and even customize how the IDs are generated.

## Installation

```bash
npm install prisma-prefixed-ids
```

## Usage

```typescript
import { type Prisma, PrismaClient } from "@prisma/client";
import { extendPrismaClient } from 'prisma-prefixed-ids';

type ModelName = Prisma.ModelName;
// NOTE: if your Prisma.ModelName is not available in your setup,
// simply use the following instead:
// type ModelName = string;

// Create your Prisma client
const prisma = new PrismaClient();

// Define your model prefixes
const prefixes: Partial<Record<ModelName, string>> = {
  Organization: 'org',
  User: 'usr',
  // Add more model prefixes as needed
};

// Extend the client with prefixed IDs
const extendedPrisma = extendPrismaClient(prisma, {
  prefixes,
});
// NOTE: if typing is an issue, simply override the 
// return type to be the original `PrismaClient`:
// const extendedPrisma = extendPrismaClient(prisma, {
//    prefixes,
// }) as unknown as PrismaClient

// Use the extended client
const organization = await extendedPrisma.organization.create({
  data: {
    name: 'My Organization',
    // id will be automatically generated with prefix 'org_'
  },
});

console.log(organization.id); // e.g., 'org_abc123...'
```

## Nested Writes Support (v1.5.0+)

Since version 1.5.0, this package fully supports **nested writes** with automatic ID generation for all related records. This includes complex relationship operations like:

### Basic Nested Creates

```typescript
// Create a user with nested posts
const userWithPosts = await extendedPrisma.user.create({
  data: {
    name: 'John Doe',
    email: 'john@example.com',
    posts: {
      create: [
        {
          title: 'My First Post',
          content: 'Hello world!',
          published: true,
        },
        {
          title: 'Draft Post', 
          content: 'Work in progress...',
          published: false,
        },
      ],
    },
  },
  include: { posts: true },
});

// Result:
// - User gets ID: usr_abc123...
// - Posts get IDs: pst_def456..., pst_ghi789...
```

### Deep Nested Writes

```typescript
// Create deeply nested structures with automatic ID generation
const complexUser = await extendedPrisma.user.create({
  data: {
    name: 'Jane Smith',
    email: 'jane@example.com',
    posts: {
      create: {
        title: 'Post with Categories and Comments',
        content: 'A comprehensive post...',
        published: true,
        categories: {
          create: {
            name: 'Technology',
            description: 'Tech-related posts',
          },
        },
        comments: {
          createMany: {
            data: [
              { content: 'Great post!', authorName: 'Reader 1' },
              { content: 'Very informative', authorName: 'Reader 2' },
            ],
          },
        },
      },
    },
  },
  include: {
    posts: {
      include: {
        categories: true,
        comments: true,
      },
    },
  },
});

// All related records automatically get prefixed IDs:
// - User: usr_...
// - Post: pst_...  
// - Category: cat_...
// - Comments: cmt_..., cmt_...
```

### Update Operations with Nested Creates

```typescript
// Update existing records and create new related records
const updatedUser = await extendedPrisma.user.update({
  where: { id: 'usr_existing123' },
  data: {
    name: 'Updated Name',
    posts: {
      create: [
        {
          title: 'New Post After Update',
          content: 'Added after user update',
        },
      ],
    },
  },
  include: { posts: true },
});

// Existing user keeps original ID, new posts get fresh prefixed IDs
```

### Upsert Operations

```typescript
// Upsert with nested creates
const upsertedUser = await extendedPrisma.user.upsert({
  where: { email: 'maybe@example.com' },
  create: {
    name: 'New User',
    email: 'maybe@example.com',
    posts: {
      create: {
        title: 'First Post',
        content: 'Created during upsert',
      },
    },
  },
  update: {
    name: 'Updated Existing User',
  },
  include: { posts: true },
});

// IDs are generated only for the create branch if record doesn't exist
```

### ConnectOrCreate Operations

```typescript
// Connect to existing or create new with automatic ID generation
const postWithCategories = await extendedPrisma.post.create({
  data: {
    title: 'Post with Mixed Categories',
    content: 'Some categories exist, others will be created',
    categories: {
      connectOrCreate: [
        {
          where: { name: 'Existing Category' },
          create: { name: 'Should not be created' },
        },
        {
          where: { name: 'New Category' },
          create: { 
            name: 'New Category',
            description: 'Freshly created category',
          },
        },
      ],
    },
  },
  include: { categories: true },
});

// New categories get prefixed IDs, existing ones are connected as-is
```

### Supported Nested Operations

The extension supports all Prisma nested write operations:

- ✅ **`create`** - Single nested record creation
- ✅ **`createMany`** - Multiple nested records creation  
- ✅ **`connectOrCreate`** - Connect existing or create new records
- ✅ **`upsert`** - Update existing or create new records
- ✅ **Deeply nested structures** - Multiple levels of relationships
- ✅ **Mixed operations** - Combining create, connect, disconnect in single query

All nested records that are created (not connected to existing ones) will automatically receive prefixed IDs according to your configuration.

## Custom ID Generation

You can customize how IDs are generated by providing your own ID generator function:

```typescript
import { extendPrismaClient } from 'prisma-prefixed-ids';
import { customAlphabet } from 'nanoid';

// Create a custom ID generator
const customIdGenerator = (prefix: string) => {
  const nanoid = customAlphabet('1234567890abcdef', 10);
  return `${prefix}_${nanoid()}`;
};

const extendedPrisma = extendPrismaClient(prisma, {
  prefixes: {
    Organization: 'org',
    User: 'usr',
  },
  idGenerator: customIdGenerator,
});
```

## Configuration Options

The extension accepts the following configuration:

- `prefixes`: A record mapping model names to their prefixes (required)
- `idGenerator`: A function that generates IDs (optional, defaults to using nanoid)

### Prefixes Configuration

The `prefixes` configuration is a simple object where:
- Keys are your Prisma model names (case sensitive)
- Values are the prefixes you want to use (without the underscore, which is added automatically)

Example:
```typescript
const prefixes = {
  Organization: 'org',
  User: 'usr',
  Post: 'post',
  Comment: 'cmt',
};
```

### ID Generator Function

The `idGenerator` function should:
- Accept a prefix as its only parameter
- Return a string that will be used as the ID

The default generator uses nanoid with a 24-character length and alphanumeric characters.

## Why nanoid instead of UUID v4?

This package uses [nanoid](https://github.com/ai/nanoid) for ID generation instead of UUID v4 for several reasons:

1. **Better Collision Resistance**: While UUID v4 has a 122-bit random component, nanoid with 24 characters (using 36 possible characters) provides approximately 128 bits of entropy, making it even more collision-resistant than UUID v4.

2. **Smaller Size**: A UUID v4 is 36 characters long (including hyphens), while a nanoid with 24 characters is more compact. When combined with a prefix (e.g., `usr_`), the total length is still shorter than a UUID v4.

3. **URL-Safe**: nanoid uses URL-safe characters by default, making it suitable for use in URLs without encoding.

4. **Customizable**: nanoid allows you to customize the alphabet and length, giving you more control over the ID format.

5. **Better Performance**: nanoid is optimized for performance and generates IDs faster than UUID v4.

For example, with a 24-character nanoid:
- The chance of a collision is approximately 1 in 2^142 (even better than UUID v4's 2^122)
- The ID length is 24 characters + prefix length (e.g., `usr_abc123DEF...`)
- The alphabet includes 62 characters (0-9, a-z, A-Z), providing high entropy while remaining readable

## Development

### Running Tests

This project includes comprehensive unit and integration tests that support SQLite, PostgreSQL, and MySQL:

```bash
# Run all tests (uses SQLite by default)
npm test

# Run only unit tests (fast, no database)
npm run test:unit

# Run only integration tests (uses SQLite by default)
npm run test:integration

# Run integration tests with PostgreSQL
npm run test:integration:pg

# Run integration tests with MySQL
npm run test:integration:mysql
```

#### Testing with SQLite (Default)

By default, tests use SQLite which requires no additional setup. The test database is automatically created and managed.

#### Testing with PostgreSQL

To run tests against PostgreSQL:

1. **Start a PostgreSQL instance** (e.g., using Docker):
```bash
docker run --name postgres-test \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=prisma_test \
  -p 5432:5432 -d postgres:15
```

2. **Create a `.env.testing` file** in the project root:
```env
TEST_DATABASE_PROVIDER=postgresql
# IMPORTANT: Use TEST_DATABASE_URL to avoid accidentally affecting production
TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/prisma_test"
```

3. **Run the tests**:
```bash
npm test
# or specifically run integration tests
npm run test:integration
# or use the shortcut
npm run test:integration:pg
```

#### Testing with MySQL

To run tests against MySQL:

1. **Start a MySQL instance** (e.g., using Docker):
```bash
docker run --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=prisma_test \
  -p 3306:3306 -d mysql:8
```

2. **Create a `.env.testing` file** in the project root:
```env
TEST_DATABASE_PROVIDER=mysql
# IMPORTANT: Use TEST_DATABASE_URL to avoid accidentally affecting production
TEST_DATABASE_URL="mysql://root:password@localhost:3306/prisma_test"
```

3. **Run the tests**:
```bash
npm test
# or use the shortcut
npm run test:integration:mysql
```

The test setup automatically:
- ✅ Detects the database provider from `.env.testing` (SQLite, PostgreSQL, or MySQL)
- ✅ Resets the database before running tests
- ✅ Generates the Prisma client with the correct provider
- ✅ Cleans up test data between tests

#### CI/CD Configuration

For CI/CD environments, you can configure different databases for different scenarios:

**GitHub Actions example:**
```yaml
# .github/workflows/ci.yml
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

  test-mysql:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: password
          MYSQL_DATABASE: prisma_test
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
        ports:
          - 3306:3306
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - name: Create .env.testing
        run: |
          echo "TEST_DATABASE_PROVIDER=mysql" >> .env.testing
          echo 'TEST_DATABASE_URL="mysql://root:password@localhost:3306/prisma_test"' >> .env.testing
      - run: npm test
```

**Local Development:**
- Use PostgreSQL for thorough testing: Create `.env.testing` with `DB_TESTING=postgresql`
- Use SQLite for quick iterations: Don't create `.env.testing` or set `DB_TESTING=sqlite`

For more detailed development information, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

MIT 