import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
import { databaseDiagnostic } from './database-diagnostic.mjs';
process.env.VYMPA_DATABASE_TARGET = 'supabase';
let client;
try {
  loadDatabaseEnvironment();
  client = new pg.Client({ ...databaseOptions(process.env.DATABASE_URL), query_timeout: 10000 });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const identity = (
    await client.query(
      'SELECT current_database() AS database, current_user AS role, version() AS version',
    )
  ).rows[0];
  const tables = (
    await client.query(
      "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname IN ('public','vympa_private') ORDER BY 1,2",
    )
  ).rows;
  const historyTable = tables.find((t) => t.tablename === '_prisma_migrations');
  let history = [];
  if (historyTable)
    history = (
      await client.query(
        'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "' +
          historyTable.schemaname +
          '"._prisma_migrations ORDER BY started_at',
      )
    ).rows;
  const base = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
  const local = fs
    .readdirSync(base)
    .filter((n) => fs.existsSync(base + '/' + n + '/migration.sql'))
    .sort()
    .map((name) => {
      const checksum = createHash('sha256')
        .update(fs.readFileSync(base + '/' + name + '/migration.sql'))
        .digest('hex');
      const remote = history.filter((m) => m.migration_name === name && !m.rolled_back_at).at(-1);
      return {
        name,
        state: !remote
          ? 'PENDENTE'
          : !remote.finished_at
            ? 'FALHA'
            : remote.checksum === checksum
              ? 'APLICADA_CHECKSUM_OK'
              : 'CHECKSUM_DIVERGENTE',
      };
    });
  const counts = [];
  for (const t of tables.filter((t) => t.tablename !== '_prisma_migrations')) {
    const r = await client.query(
      'SELECT count(*)::text AS count FROM "' + t.schemaname + '"."' + t.tablename + '"',
    );
    counts.push({ ...t, count: r.rows[0].count });
  }
  const roles = (
    await client.query(
      'SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user',
    )
  ).rows;
  const auth = (await client.query('SELECT count(*)::text AS users FROM auth.users')).rows[0];
  await client.query('ROLLBACK');
  const report = {
    projectRef: 'qxuqxonpgundilvnajtl',
    checkedAt: new Date().toISOString(),
    readOnly: true,
    identity,
    tables: counts,
    migrations: local,
    unknownHistory: history
      .filter((m) => !local.some((l) => l.name === m.migration_name))
      .map((m) => m.migration_name),
    connectionRole: roles,
    authUserCount: auth.users,
  };
  fs.writeFileSync(
    new URL('../../../docs/deployment/database-audit.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await client?.end();
}
