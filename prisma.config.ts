import { defineConfig } from 'prisma/config'

// Determine which schema to use based on DATABASE_URL
const getDatasourceConfig = (): { schema: string; datasource: { url: string } } => {
  const url = process.env.DATABASE_URL

  if (url?.startsWith('mysql://')) {
    return {
      schema: 'tests/prisma/schema.mysql.prisma',
      datasource: { url },
    }
  }

  if (url?.startsWith('postgresql://') || url?.startsWith('postgres://')) {
    return {
      schema: 'tests/prisma/schema.postgres.prisma',
      datasource: { url },
    }
  }

  // Default to SQLite
  return {
    schema: 'tests/prisma/schema.prisma',
    datasource: { url: 'file:tests/db/test.db' },
  }
}

const config = getDatasourceConfig()

export default defineConfig({
  schema: config.schema,
  datasource: config.datasource,
})
