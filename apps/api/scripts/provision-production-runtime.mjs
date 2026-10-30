import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import pg from 'pg';
import { parse } from 'dotenv';
import {
  loadDatabaseEnvironment,
  databaseOptions,
  resolveDatabaseCaPath,
} from '../src/config/database-environment.ts';
import { databaseDiagnostic } from './database-diagnostic.mjs';
if (process.argv.length !== 3 || process.argv[2] !== '--confirm=PROVISION_VYMPA_RUNTIME') {
  console.error('Confirmação explícita de provisionamento runtime obrigatória.');
  process.exit(1);
}
const apiRoot = new URL('../', import.meta.url);
const productionFile = new URL('.env.production.local', apiRoot);
const backupFile = new URL('.env.production-backup', apiRoot);
let client;
let stage = 'preflight';
try {
  const productionText = fs.readFileSync(productionFile, 'utf8');
  const production = parse(productionText);
  process.env.VYMPA_DATABASE_TARGET = 'supabase';
  loadDatabaseEnvironment();
  const url = new URL(process.env.DATABASE_URL);
  client = new pg.Client({ ...databaseOptions(url.href), query_timeout: 10000 });
  await client.connect();
  const role = (await client.query("SELECT 1 FROM pg_roles WHERE rolname='vympa_runtime'")).rows;
  if (role.length || production.DATABASE_URL)
    throw new Error('Runtime já existe; não rotacionar nem substituir automaticamente.');
  const tables = (
    await client.query(
      "SELECT schemaname,tablename,rowsecurity FROM pg_tables WHERE schemaname='vympa_private' OR (schemaname='public' AND tablename='system_metadata') ORDER BY 1,2",
    )
  ).rows;
  if (tables.length !== 39 || tables.some((t) => !t.rowsecurity || !/^[a-z_]+$/.test(t.tablename)))
    throw new Error('Inventário de tabelas/RLS divergente.');
  stage = 'backup';
  const pgEnv = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'verify-full',
  };
  if (process.env.SUPABASE_SSL_CA_FILE)
    pgEnv.PGSSLROOTCERT = resolveDatabaseCaPath(process.env.SUPABASE_SSL_CA_FILE);
  const dump = spawnSync(
    'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',
    [
      '--host',
      url.hostname,
      '--port',
      url.port,
      '--username',
      decodeURIComponent(url.username),
      '--dbname',
      'postgres',
      '--schema=public',
      '--schema=vympa_private',
      '--format=custom',
      '--no-owner',
      '--no-acl',
    ],
    { env: pgEnv, maxBuffer: 32 * 1024 * 1024, timeout: 60000, windowsHide: true },
  );
  if (dump.status !== 0 || !dump.stdout?.length) throw new Error('Backup não concluído.');
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(dump.stdout), cipher.final()]);
  const tag = cipher.getAuthTag();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const restored = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  if (!restored.equals(dump.stdout)) throw new Error('Verificação criptográfica falhou.');
  const listing = spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe', ['--list'], {
    input: restored,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15000,
    windowsHide: true,
  });
  if (listing.status !== 0 || !listing.stdout.toString().includes('admin_profiles'))
    throw new Error('Arquivo de backup inválido.');
  fs.writeFileSync(
    backupFile,
    JSON.stringify({
      format: 'pg_dump-custom-aes-256-gcm',
      createdAt: new Date().toISOString(),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    }) + '\n',
    { flag: 'wx' },
  );
  fs.writeFileSync(
    new URL('.env.backup-recovery.local', apiRoot),
    'DATABASE_BACKUP_KEY=' + key.toString('base64') + '\n',
    { flag: 'wx' },
  );
  console.log(
    'Backup criptografado dos schemas da aplicação salvo; decrypt e pg_restore --list verificados.',
  );
  stage = 'papel restrito';
  const password = randomBytes(32).toString('hex');
  await client.query('BEGIN');
  await client.query(
    "CREATE ROLE vympa_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '" +
      password +
      "'",
  );
  await client.query('GRANT USAGE ON SCHEMA public,vympa_private TO vympa_runtime');
  for (const t of tables) {
    const target = '"' + t.schemaname + '"."' + t.tablename + '"';
    const permissions =
      t.schemaname === 'public' ? 'SELECT,INSERT,UPDATE' : 'SELECT,INSERT,UPDATE,DELETE';
    await client.query('GRANT ' + permissions + ' ON TABLE ' + target + ' TO vympa_runtime');
    await client.query(
      'CREATE POLICY vympa_runtime_backend ON ' +
        target +
        ' FOR ALL TO vympa_runtime USING (true) WITH CHECK (true)',
    );
  }
  const runtimeUrl = new URL(url.href);
  runtimeUrl.username = 'vympa_runtime.qxuqxonpgundilvnajtl';
  runtimeUrl.password = password;
  runtimeUrl.port = '6543';
  fs.appendFileSync(productionFile, 'DATABASE_URL=' + runtimeUrl.href + '\n');
  if (process.env.SUPABASE_SSL_CA_FILE)
    fs.appendFileSync(
      productionFile,
      'SUPABASE_SSL_CA=' +
        JSON.stringify(
          fs.readFileSync(resolveDatabaseCaPath(process.env.SUPABASE_SSL_CA_FILE), 'utf8'),
        ) +
        '\n',
    );
  await client.query('COMMIT');
  console.log(
    'Papel vympa_runtime provisionado sem privilégios administrativos; 39 políticas restritas ao papel backend.',
  );
  fs.writeFileSync(
    new URL('../../../docs/deployment/runtime-provisioning.json', import.meta.url),
    JSON.stringify(
      {
        projectRef: 'qxuqxonpgundilvnajtl',
        role: 'vympa_runtime',
        tables: tables.length,
        bypassRls: false,
        adminPrivileges: false,
        backupEncrypted: true,
        backupCatalogValidated: true,
        fullRestoreTested: false,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error('Provisionamento interrompido em ' + stage + ': ' + databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await client?.end();
}
