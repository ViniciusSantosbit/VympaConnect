import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { databaseOptions } from '../src/config/database-environment.ts';
import { DatabaseThrottlerStorage } from '../dist/config/database-throttler.js';
import { validateEnvironment } from '../dist/config/environment.js';
import { databaseDiagnostic } from './database-diagnostic.mjs';
const values = parse(fs.readFileSync(new URL('../.env.production.local', import.meta.url)));
for (const [key, value] of Object.entries(values))
  if (key !== 'DATABASE_BACKUP_KEY') process.env[key] = value;
let db;
const rollback = new Error('ROLLBACK_CONTROLLED_PROBE');
try {
  validateEnvironment(process.env);
  db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(values.DATABASE_URL)) });
  await db.$connect();
  const role =
    await db.$queryRaw`SELECT current_user AS role,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if (role.some((r) => r.rolsuper || r.rolcreatedb || r.rolcreaterole || r.rolbypassrls))
    throw new Error();
  const access =
    await db.$queryRaw`SELECT has_schema_privilege(current_user,'auth','USAGE') AS auth,has_schema_privilege(current_user,'storage','USAGE') AS storage,has_table_privilege(current_user,'public._prisma_migrations','UPDATE') AS migrations`;
  if (access.some((row) => Object.values(row).some(Boolean))) throw new Error();
  await db
    .$transaction(async (tx) => {
      const adapter = { $transaction: async (fn) => fn(tx) };
      const one = new DatabaseThrottlerStorage(adapter),
        two = new DatabaseThrottlerStorage(adapter);
      const key = 'production-probe:' + randomUUID();
      const a = await one.increment(key, 60000, 1, 60000, 'probe');
      const b = await two.increment(key, 60000, 1, 60000, 'probe');
      if (a.isBlocked || !b.isBlocked || b.totalHits !== 2) throw new Error();
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) throw error;
    });
  const profiles = await db.adminProfile.count({ where: { role: 'OWNER', active: true } });
  const audit = await db.adminAuditEvent.count({
    where: { action: 'PRODUCTION_OWNER_BOOTSTRAPPED' },
  });
  console.log(
    JSON.stringify({
      prismaRuntime: 'PASSOU',
      restrictedRole: 'PASSOU',
      privateSchemasBlocked: 'PASSOU',
      rateLimitSharedStorage: 'PASSOU',
      controlledWrite: 'ROLLBACK',
      ownerProfiles: profiles,
      bootstrapAuditEvents: audit,
    }),
  );
} catch (error) {
  console.error('Verificação runtime não concluída: ' + databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
