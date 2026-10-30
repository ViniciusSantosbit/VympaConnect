import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
import { databaseDiagnostic } from './database-diagnostic.mjs';

// Credencial de operador somente local. Nunca executar durante build/runtime Vercel.
const identity = process.argv[2];
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    identity ?? '',
  ) ||
  process.argv[3] !== '--confirm=BOOTSTRAP_PRODUCTION_OWNER' ||
  process.argv.length !== 4
) {
  console.error('Exige UUID real e --confirm=BOOTSTRAP_PRODUCTION_OWNER.');
  process.exit(1);
}
let client;
try {
  process.env.VYMPA_DATABASE_TARGET = 'supabase';
  loadDatabaseEnvironment();
  client = new pg.Client(databaseOptions(process.env.DATABASE_URL));
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query('LOCK TABLE vympa_private.admin_profiles IN EXCLUSIVE MODE');
  const existing = await client.query(
    'SELECT count(*)::int AS count FROM vympa_private.admin_profiles',
  );
  if (existing.rows[0].count !== 0)
    throw new Error('Bootstrap disponível somente sem perfis existentes.');
  const result = await client.query(
    'SELECT id,email,email_confirmed_at,is_anonymous,banned_until,deleted_at FROM auth.users WHERE id=$1',
    [identity],
  );
  const user = result.rows[0];
  if (
    !user?.email_confirmed_at ||
    !user.email ||
    user.is_anonymous ||
    user.deleted_at ||
    (user.banned_until && new Date(user.banned_until) > new Date())
  )
    throw new Error('Identidade não elegível.');
  const profile = randomUUID();
  await client.query(
    `INSERT INTO vympa_private.admin_profiles (id,identity_id,email,role,updated_at) VALUES ($1,$2,$3,'OWNER',now())`,
    [profile, identity, user.email.toLowerCase()],
  );
  await client.query(
    `INSERT INTO vympa_private.admin_audit_events (id,actor_id,action,target_id) VALUES ($1,$2,'PRODUCTION_OWNER_BOOTSTRAPPED',$3)`,
    [randomUUID(), profile, identity],
  );
  await client.query('COMMIT');
  console.log(
    'Primeiro OWNER vinculado à identidade existente e auditado. MFA permanece obrigatório.',
  );
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error('Bootstrap não concluído: ' + databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await client?.end();
}
