import { describe, it, expect, afterEach } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { authSettings } from '../dist/modules/auth/auth-config.js';
import { validateEnvironment } from '../dist/config/environment.js';
import { loadDatabaseEnvironment, databaseOptions } from '../dist/config/database-environment.js';
const previous = { ...process.env };
afterEach(() => {
  process.env = { ...previous };
});
function configuration() {
  return {
    NODE_ENV: 'production',
    VYMPA_DATABASE_TARGET: 'production',
    VYMPA_SUPABASE_PROJECT_REF: 'qxuqxonpgundilvnajtl',
    VERCEL_ENV: 'production',
    DATABASE_URL:
      'postgresql://vympa_runtime.qxuqxonpgundilvnajtl:test@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
    AUTH_ENVIRONMENT: 'production',
    SUPABASE_AUTH_URL: 'https://qxuqxonpgundilvnajtl.supabase.co',
    AUTH_WEB_ORIGIN: 'https://vympaconnect.vercel.app',
    CORS_ORIGINS: 'https://vympaconnect.vercel.app',
    SUPABASE_AUTH_PUBLISHABLE_KEY: 'fixture-public-key',
    SUPABASE_AUTH_SECRET_KEY: 'fixture-secret-key',
    AUTH_SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    LOG_LEVEL: 'info',
  };
}
function validate(change = {}) {
  const input = { ...configuration(), ...change };
  Object.assign(process.env, input);
  return validateEnvironment(input);
}
describe('Configuração produtiva sem fallback local', () => {
  it('aceita somente configuração produtiva completa e HTTPS', () => {
    expect(validate().NODE_ENV).toBe('production');
    expect(authSettings(process.env).secure).toBe(true);
    expect(() => loadDatabaseEnvironment()).not.toThrow();
    expect(databaseOptions(process.env.DATABASE_URL)).toMatchObject({
      max: 2,
      ssl: { rejectUnauthorized: true },
    });
  });
  it.each([
    { VERCEL_ENV: 'preview' },
    { VYMPA_SUPABASE_PROJECT_REF: 'other-project' },
    { SUPABASE_AUTH_SECRET_KEY: '' },
    { SUPABASE_AUTH_PUBLISHABLE_KEY: '' },
    { AUTH_SESSION_ENCRYPTION_KEY: '' },
    { AUTH_ENVIRONMENT: 'local' },
    { AUTH_WEB_ORIGIN: 'http://localhost:5173' },
    { SUPABASE_AUTH_URL: 'https://other.supabase.co' },
    { CORS_ORIGINS: 'https://other.example.com' },
    { CORS_ORIGINS: '*' },
    { LOG_LEVEL: 'trace' },
    { AUTH_ENABLE_BREAK_GLASS: 'true' },
    {
      DATABASE_URL:
        'postgresql://postgres.qxuqxonpgundilvnajtl:test@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
    },
    {
      DATABASE_URL:
        'postgresql://vympa_runtime.qxuqxonpgundilvnajtl:test@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
    },
  ])('recusa configuração insegura %j', (change) => {
    expect(() => validate(change)).toThrow();
  });
  it('não carrega arquivos de desenvolvimento ao faltar seleção produtiva', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VYMPA_DATABASE_TARGET;
    expect(() => loadDatabaseEnvironment()).toThrow('seleção explícita');
  });
});
