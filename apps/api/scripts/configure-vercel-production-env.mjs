import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
if (process.argv.length !== 3 || process.argv[2] !== '--confirm=UPLOAD_PRODUCTION_ENV_TO_VERCEL') {
  console.error('Confirmação explícita para configurar Production da API Vercel obrigatória.');
  process.exit(1);
}
const values = parse(fs.readFileSync(new URL('../.env.production.local', import.meta.url)));
const required = [
  'NODE_ENV',
  'VYMPA_DATABASE_TARGET',
  'VYMPA_SUPABASE_PROJECT_REF',
  'DATABASE_URL',
  'SUPABASE_SSL_CA',
  'AUTH_ENVIRONMENT',
  'AUTH_WEB_ORIGIN',
  'CORS_ORIGINS',
  'LOG_LEVEL',
  'AUTH_ENABLE_BREAK_GLASS',
  'SUPABASE_AUTH_URL',
  'SUPABASE_AUTH_PUBLISHABLE_KEY',
  'SUPABASE_AUTH_SECRET_KEY',
  'AUTH_SESSION_ENCRYPTION_KEY',
];
for (const key of required)
  if (!values[key]) {
    console.error('Variável obrigatória ausente: ' + key);
    process.exit(1);
  }
if (
  values.VYMPA_SUPABASE_PROJECT_REF !== 'qxuqxonpgundilvnajtl' ||
  !values.DATABASE_URL.startsWith('postgresql://vympa_runtime.qxuqxonpgundilvnajtl:')
) {
  console.error('Destino produtivo ou papel runtime divergente.');
  process.exit(1);
}
const payload = required.map((key) => ({
  key,
  value: values[key],
  type: /DATABASE_URL|SECRET|ENCRYPTION/.test(key) ? 'sensitive' : 'encrypted',
  target: ['production'],
}));
for (const variable of payload) {
  const result = spawnSync(
    process.execPath,
    [
      join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'),
      '--yes',
      'vercel@65.8.0',
      'env',
      'add',
      variable.key,
      '--project',
      'vympaconnect-api',
      '--environment',
      'production',
      '--sensitive',
      '--force',
      '--yes',
      '--scope',
      'vinicius-santos-projects-bb2d4523',
    ],
    {
      input: variable.value,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000,
      stdio: ['pipe', 'ignore', 'pipe'],
    },
  );
  if (result.status !== 0) {
    let diagnostic = String(result.stderr ?? result.error?.code ?? '');
    for (const key of required)
      if (values[key].length > 12) diagnostic = diagnostic.split(values[key]).join('[REDACTED]');
    diagnostic = diagnostic
      .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[REDACTED]');
    console.error(
      'Env ' + variable.key + ' upload failed (sanitized): ' + diagnostic.slice(0, 1000),
    );
    process.exit(1);
  }
  console.log(variable.key + ': configurada em Production; valor oculto.');
}

console.log(
  '14 variáveis configuradas exclusivamente em Production da API Vercel. Valores ocultos; nenhum deployment iniciado.',
);
