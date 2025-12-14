/**
 * Database setup utility for integration tests
 * Supports both SQLite and PostgreSQL based on environment configuration
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from .env.testing if it exists
const envTestingPath = path.resolve(process.cwd(), '.env.testing');
if (fs.existsSync(envTestingPath)) {
  dotenv.config({ path: envTestingPath });
  console.log('✓ Loaded .env.testing');
}

const testDbProvider = process.env.TEST_DATABASE_PROVIDER || 'sqlite';
// SAFETY: Use TEST_DATABASE_URL to avoid accidentally affecting production databases
const databaseUrl = process.env.TEST_DATABASE_URL;

console.log(`\n🔧 Setting up test database (${testDbProvider})...\n`);

// Configure database based on TEST_DATABASE_PROVIDER env
let dbProvider;
let dbUrl;

if (testDbProvider === 'postgresql' || testDbProvider === 'postgres') {
  dbProvider = 'postgresql';

  if (!databaseUrl) {
    console.error('❌ Error: TEST_DATABASE_URL must be set when TEST_DATABASE_PROVIDER=postgresql');
    console.error('   Example: TEST_DATABASE_URL="postgresql://user:password@localhost:5432/test_db"');
    console.error('');
    console.error('⚠️  SAFETY: We use TEST_DATABASE_URL instead of DATABASE_URL to prevent');
    console.error('   accidentally running tests against production databases.');
    process.exit(1);
  }

  // Safety check: Warn if database name doesn't look like a test database
  if (!databaseUrl.includes('test') && !databaseUrl.includes('dev')) {
    console.warn('⚠️  WARNING: Database URL does not contain "test" or "dev".');
    console.warn('   Make sure you are not pointing to a production database!');
    console.warn(`   Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
    console.warn('');
  }

  dbUrl = databaseUrl;
  console.log('📊 Using PostgreSQL for testing');
  console.log(`   Connection: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);
} else if (testDbProvider === 'mysql') {
  dbProvider = 'mysql';

  if (!databaseUrl) {
    console.error('❌ Error: TEST_DATABASE_URL must be set when TEST_DATABASE_PROVIDER=mysql');
    console.error('   Example: TEST_DATABASE_URL="mysql://user:password@localhost:3306/test_db"');
    console.error('');
    console.error('⚠️  SAFETY: We use TEST_DATABASE_URL instead of DATABASE_URL to prevent');
    console.error('   accidentally running tests against production databases.');
    process.exit(1);
  }

  // Safety check: Warn if database name doesn't look like a test database
  if (!databaseUrl.includes('test') && !databaseUrl.includes('dev')) {
    console.warn('⚠️  WARNING: Database URL does not contain "test" or "dev".');
    console.warn('   Make sure you are not pointing to a production database!');
    console.warn(`   Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
    console.warn('');
  }

  dbUrl = databaseUrl;
  console.log('📊 Using MySQL for testing');
  console.log(`   Connection: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);
} else {
  // Default to SQLite
  dbProvider = 'sqlite';
  const dbDir = path.resolve(__dirname, 'db');

  // Ensure db directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbUrl = 'file:../db/test.db';
  console.log('📊 Using SQLite for testing');
  console.log(`   Database: ${path.join(dbDir, 'test.db')}`);
}

// Generate schema file with correct provider
const baseSchemaPath = path.resolve(__dirname, 'prisma', 'schema.prisma');
const generatedSchemaPath = path.resolve(__dirname, 'prisma', '.schema.generated.prisma');

console.log('\n📝 Generating schema with provider:', dbProvider);

// Read base schema template and replace __PROVIDER__ placeholder
const baseSchema = fs.readFileSync(baseSchemaPath, 'utf-8');
const generatedSchema = baseSchema.replace(
  /__PROVIDER__/g,
  dbProvider
);
fs.writeFileSync(generatedSchemaPath, generatedSchema);

const schemaPath = generatedSchemaPath;

// Set environment variables for Prisma
// SAFETY: Use TEST_DATABASE_URL for test database
process.env.TEST_DATABASE_URL = dbUrl;

/**
 * Reset the database
 */
async function resetDatabase() {
  try {
    if (dbProvider === 'postgresql' || dbProvider === 'mysql') {
      console.log(`\n🔄 Resetting ${dbProvider === 'postgresql' ? 'PostgreSQL' : 'MySQL'} database...`);

      // Drop all tables
      execSync(`npx prisma migrate reset --force --skip-generate --schema="${schemaPath}"`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          TEST_DATABASE_URL: dbUrl,
        },
      });
    } else {
      console.log('\n🔄 Resetting SQLite database...');

      // Delete SQLite database file
      const dbPath = path.resolve(__dirname, 'db', 'test.db');
      const dbJournalPath = `${dbPath}-journal`;

      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('   ✓ Removed test.db');
      }

      if (fs.existsSync(dbJournalPath)) {
        fs.unlinkSync(dbJournalPath);
        console.log('   ✓ Removed test.db-journal');
      }
    }

    console.log('✓ Database reset complete\n');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    throw error;
  }
}

/**
 * Generate Prisma Client
 */
function generatePrismaClient() {
  try {
    console.log('📦 Generating Prisma Client...');
    console.log(`   Schema: ${schemaPath}`);

    execSync(`npx prisma generate --schema="${schemaPath}"`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: dbUrl,
      },
    });

    console.log('✓ Prisma Client generated\n');
  } catch (error) {
    console.error('❌ Error generating Prisma Client:', error);
    throw error;
  }
}

/**
 * Push database schema
 */
function pushDatabaseSchema() {
  try {
    console.log('🚀 Pushing database schema...');

    execSync(`npx prisma db push --skip-generate --schema="${schemaPath}"`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: dbUrl,
      },
    });

    console.log('✓ Schema pushed\n');
  } catch (error) {
    console.error('❌ Error pushing schema:', error);
    throw error;
  }
}

/**
 * Main setup function
 */
async function setup() {
  try {
    await resetDatabase();
    generatePrismaClient();
    pushDatabaseSchema();

    console.log('✅ Database setup complete!\n');
    console.log('═'.repeat(50));
    console.log('Ready to run integration tests');
    console.log('═'.repeat(50));
  } catch (error) {
    console.error('\n❌ Database setup failed');
    process.exit(1);
  }
}

// Run setup
setup();
