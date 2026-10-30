import { defineConfig } from 'prisma/config';
import { databaseTarget, loadDatabaseEnvironment } from './src/config/database-environment.ts';
// A CLI nunca recebe datasource remoto nesta etapa, mesmo se invocada diretamente.
const args = process.argv.slice(2);
if (
  args.includes('reset') ||
  (args.includes('db') && (args.includes('push') || args.includes('execute')))
)
  throw new Error('Operação Prisma destrutiva bloqueada.');
const offline =
  args.includes('generate') ||
  args.includes('validate') ||
  (args.includes('diff') && args.includes('--from-schema') && args.includes('--to-schema'));
if (!offline && databaseTarget() !== 'local')
  throw new Error('CLI Prisma remota bloqueada: migrations exigem autorização separada.');
if (!offline) loadDatabaseEnvironment();
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(!offline && process.env.DATABASE_URL
    ? { datasource: { url: process.env.DATABASE_URL } }
    : {}),
});
