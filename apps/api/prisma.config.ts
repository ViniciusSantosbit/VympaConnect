import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });
const databaseUrl = process.env.DATABASE_URL?.trim();
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generate/validate não precisam de banco. Migrate exige datasource explícito.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
