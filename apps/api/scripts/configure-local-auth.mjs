import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { authSettings } from '../src/modules/auth/auth-config.ts';
import { assertDatabaseUrl } from '../src/config/database-environment.ts';
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const path = fileURLToPath(new URL('../.env', import.meta.url));
try {
  if (process.argv.includes('--help')) {
    console.log(
      'Inicie o Supabase CLI local com supabase start na raiz, execute npm run setup se o .env ainda não existir e rode npm run auth:configure-local. O comando captura chaves locais sem imprimi-las e preserva DATABASE_URL.',
    );
    process.exit(0);
  }
  execFileSync('git', ['check-ignore', '--quiet', 'apps/api/.env'], { cwd: workspace });
  let text = readFileSync(path, 'utf8');
  const previous = parse(text);
  assertDatabaseUrl(previous.DATABASE_URL ?? '', 'local');
  const local = JSON.parse(
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('../../../node_modules/supabase/dist/supabase.js', import.meta.url)),
        'status',
        '-o',
        'json',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
  );
  const values = {
    AUTH_ENVIRONMENT: 'local',
    SUPABASE_AUTH_URL: local.API_URL,
    SUPABASE_AUTH_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY ?? local.ANON_KEY,
    SUPABASE_AUTH_SECRET_KEY: local.SECRET_KEY ?? local.SERVICE_ROLE_KEY,
    AUTH_SESSION_ENCRYPTION_KEY:
      previous.AUTH_SESSION_ENCRYPTION_KEY || randomBytes(32).toString('base64'),
    AUTH_WEB_ORIGIN: 'http://127.0.0.1:5173',
    AUTH_ISOLATED_PROJECT_CONFIRMATION: '',
  };
  if (
    !values.SUPABASE_AUTH_URL ||
    !values.SUPABASE_AUTH_PUBLISHABLE_KEY ||
    !values.SUPABASE_AUTH_SECRET_KEY
  )
    throw new Error();
  authSettings(values);
  for (const [key, value] of Object.entries(values)) {
    text = text.replace(new RegExp('^' + key + '=.*(?:\r?\n|$)', 'gm'), '');
    text += '\n' + key + '=' + JSON.stringify(value) + '\n';
  }
  writeFileSync(path, text, { mode: 0o600 });
  console.log(
    'Auth local configurado em apps/api/.env ignorado pelo Git. Chaves não exibidas; banco de aplicação preservado.',
  );
} catch {
  console.error(
    'Configuração não concluída. Verifique Supabase CLI local iniciado, .env existente com banco local e proteção pelo Git. Nenhuma credencial foi registrada.',
  );
  process.exitCode = 1;
}
