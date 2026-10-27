import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { parse } from 'dotenv';

const root = new URL('../../', import.meta.url);

export function databaseTarget(): 'local' | 'supabase' {
  const target = process.env.VYMPA_DATABASE_TARGET ?? 'local';
  if (target !== 'local' && target !== 'supabase') throw new Error('Ambiente de banco inválido.');
  return target;
}

export function assertDatabaseUrl(value: string, target = databaseTarget()): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL inválida; verifique o arquivo local seguro.');
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol))
    throw new Error('URL PostgreSQL obrigatória.');
  if (target === 'local') {
    if ([...url.searchParams.keys()].some((key) => key !== 'schema'))
      throw new Error('Parâmetros locais permitidos: apenas schema.');
    if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname))
      throw new Error('Comando local bloqueado: host não local.');
  } else {
    if (
      url.hostname !== 'aws-1-us-west-2.pooler.supabase.com' ||
      url.port !== '5432' ||
      decodeURIComponent(url.username) !== 'postgres.qxuqxonpgundilvnajtl' ||
      url.pathname !== '/postgres' ||
      !url.password ||
      url.password === 'REPLACE_WITH_PERCENT_ENCODED_PASSWORD'
    )
      throw new Error('Configure a URI do Session pooler no arquivo Supabase ignorado pelo Git.');
    if (url.searchParams.size)
      throw new Error('Use URI Supabase sem parâmetros; TLS é configurado pelo driver.');
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
      throw new Error('Validação TLS não pode ser desativada.');
  }
  return url;
}

export function loadDatabaseEnvironment(): void {
  const target = databaseTarget();
  if (process.env.NODE_ENV === 'test') {
    if (target !== 'local') throw new Error('Testes unitários exigem ambiente local.');
    assertDatabaseUrl(process.env.DATABASE_URL ?? '', 'local');
    return;
  }
  const path = new URL(target === 'local' ? '.env' : '.env.supabase.local', root);
  let values: Record<string, string>;
  try {
    values = parse(readFileSync(path));
  } catch {
    throw new Error(`Configure apps/api/${target === 'local' ? '.env' : '.env.supabase.local'}.`);
  }
  // O banco vem exclusivamente do arquivo selecionado, nunca de uma variável herdada.
  assertDatabaseUrl(values.DATABASE_URL ?? '', target);
  for (const [key, value] of Object.entries(values)) {
    if (key !== 'VYMPA_DATABASE_TARGET' && process.env[key] === undefined) process.env[key] = value;
  }
  process.env.DATABASE_URL = values.DATABASE_URL;
  process.env.SUPABASE_SSL_CA_FILE = values.SUPABASE_SSL_CA_FILE ?? '';
}

export function resolveDatabaseCaPath(value: string): string {
  return value.startsWith('file:') ? fileURLToPath(value) : resolve(fileURLToPath(root), value);
}

export function databaseOptions(connectionString: string) {
  assertDatabaseUrl(connectionString);
  const caFile = process.env.SUPABASE_SSL_CA_FILE;
  let ca: string | undefined;
  if (databaseTarget() === 'supabase' && caFile) {
    try {
      ca = readFileSync(resolveDatabaseCaPath(caFile), 'utf8');
    } catch {
      throw Object.assign(new Error('Não foi possível ler SUPABASE_SSL_CA_FILE.'), {
        code: 'VYMPA_CA_FILE',
      });
    }
    try {
      const certificates = ca.match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
      );
      if (!certificates?.length) throw new Error();
      for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
      throw Object.assign(new Error('Certificado CA PEM inválido.'), { code: 'VYMPA_CA_PEM' });
    }
  }
  return {
    connectionString,
    connectionTimeoutMillis: 5000,
    ...(databaseTarget() === 'supabase'
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(ca ? { ca } : {}),
          },
        }
      : {}),
  };
}
