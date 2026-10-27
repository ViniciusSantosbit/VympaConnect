import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { loadDatabaseEnvironment } from '../src/config/database-environment.ts';
if (process.env.VYMPA_DATABASE_TARGET === 'supabase')
  throw new Error('Teste de escrita restrito ao banco local.');
loadDatabaseEnvironment();
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL em apps/api/.env');
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  }),
});
try {
  await db.$queryRaw`SELECT 1`;
  const metadata = await db.systemMetadata.upsert({
    where: { key: 'foundation' },
    create: { key: 'foundation', value: 'stage-01' },
    update: { value: 'stage-01' },
  });
  if (metadata.value !== 'stage-01') throw new Error('Falha na persistência');
  console.log('PostgreSQL: conexão e leitura/escrita pela migration validadas.');
} catch (error) {
  console.error('Não foi possível validar PostgreSQL/migration. Código:', error.code ?? 'UNKNOWN');
  console.error('Verifique Docker, DATABASE_URL e execute npm run db:deploy.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
