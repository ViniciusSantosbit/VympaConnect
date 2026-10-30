import { ServiceUnavailableException } from '@nestjs/common';

export function authSettings(input: Record<string, unknown> = process.env) {
  const mode = String(input.AUTH_ENVIRONMENT ?? 'local');
  const url = String(input.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321');
  const origin = String(input.AUTH_WEB_ORIGIN ?? 'http://127.0.0.1:5173');
  const publicKey = String(input.SUPABASE_AUTH_PUBLISHABLE_KEY ?? '');
  const secretKey = String(input.SUPABASE_AUTH_SECRET_KEY ?? '');
  const encryptionKey = String(input.AUTH_SESSION_ENCRYPTION_KEY ?? '');
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!['local', 'isolated', 'production'].includes(mode) || (mode === 'local' && !local))
    throw new Error(
      'Auth local exige endpoint loopback; use AUTH_ENVIRONMENT=isolated para staging.',
    );
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/')
    throw new Error('SUPABASE_AUTH_URL deve conter somente a origem do serviço.');
  if ((!local && parsed.protocol !== 'https:') || !['https:', 'http:'].includes(parsed.protocol))
    throw new Error('Endpoint de autenticação exige HTTPS fora de loopback.');
  if (mode === 'isolated' && input.AUTH_ISOLATED_PROJECT_CONFIRMATION !== parsed.hostname)
    throw new Error('Confirme explicitamente o hostname do projeto Auth isolado.');
  if (mode !== 'production' && parsed.hostname === 'qxuqxonpgundilvnajtl.supabase.co')
    throw new Error('Projeto remoto principal bloqueado no ambiente de desenvolvimento Auth.');
  const web = new URL(origin);
  if (
    web.origin !== origin ||
    !['http:', 'https:'].includes(web.protocol) ||
    (!['localhost', '127.0.0.1', '[::1]'].includes(web.hostname) && web.protocol !== 'https:')
  )
    throw new Error('AUTH_WEB_ORIGIN exige origem exata e transporte seguro.');
  if (
    mode === 'production' &&
    (input.NODE_ENV !== 'production' ||
      input.VYMPA_DATABASE_TARGET !== 'production' ||
      input.VYMPA_SUPABASE_PROJECT_REF !== 'qxuqxonpgundilvnajtl' ||
      input.VERCEL_ENV === 'preview' ||
      parsed.hostname !== 'qxuqxonpgundilvnajtl.supabase.co' ||
      web.protocol !== 'https:' ||
      ['localhost', '127.0.0.1', '[::1]'].includes(web.hostname) ||
      !publicKey ||
      !secretKey ||
      !/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey) ||
      Buffer.from(encryptionKey, 'base64').length !== 32)
  )
    throw new Error(
      'Auth de produção exige projeto confirmado, HTTPS e segredos exclusivos configurados.',
    );
  return {
    mode,
    url: parsed.origin,
    origin,
    publicKey,
    secretKey,
    encryptionKey,
    secure: web.protocol === 'https:',
  };
}

export function requireAuthSettings() {
  const settings = authSettings();
  if (
    process.env.VYMPA_DATABASE_TARGET &&
    process.env.VYMPA_DATABASE_TARGET !== 'local' &&
    settings.mode !== 'production'
  )
    throw new ServiceUnavailableException(
      'Autenticação desta etapa exige banco de aplicação local.',
    );
  if (
    !settings.publicKey ||
    !/^[A-Za-z0-9+/]{43}=$/.test(settings.encryptionKey) ||
    Buffer.from(settings.encryptionKey, 'base64').length !== 32
  )
    throw new ServiceUnavailableException('Autenticação não configurada neste ambiente.');
  return settings;
}
