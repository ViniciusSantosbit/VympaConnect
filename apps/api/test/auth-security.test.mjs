import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { SupabaseIdentityService } from '../dist/modules/auth/supabase-identity.service.js';
import { authSettings } from '../dist/modules/auth/auth-config.js';
import { encryptTokens, decryptTokens } from '../dist/modules/auth/session-crypto.js';

const id = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'vympa-test', alg: 'ES256', use: 'sig' };
// Fixtures criptográficas exclusivas de testes; a aplicação nunca emite JWTs próprios.
function jwt(change = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    { alg: 'ES256', kid: 'vympa-test', typ: 'JWT' },
    {
      sub: id,
      session_id: sid,
      iss: 'http://127.0.0.1:54321/auth/v1',
      aud: 'authenticated',
      iat: now,
      exp: now + 300,
      aal: 'aal2',
      role: 'authenticated',
      ...change,
    },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'));
  const input = parts.join('.');
  return (
    input +
    '.' +
    sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  );
}
let previous;
beforeEach(() => {
  previous = { ...process.env };
  process.env.AUTH_ENVIRONMENT = 'local';
  process.env.SUPABASE_AUTH_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_AUTH_PUBLISHABLE_KEY = 'test-key';
  process.env.AUTH_SESSION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
    if (String(url).endsWith('/user'))
      return Response.json({
        id,
        email: 'admin@example.invalid',
        email_confirmed_at: new Date().toISOString(),
        aud: 'authenticated',
        role: 'authenticated',
      });
    throw new Error('Chamada inesperada no teste');
  });
});
afterEach(() => {
  process.env = previous;
  jest.restoreAllMocks();
});

describe('Identidade Supabase com verificação criptográfica real e transporte simulado', () => {
  it('aceita assinatura válida com emissor, audiência e MFA corretos', async () => {
    const service = new SupabaseIdentityService();
    await expect(service.verify(service.client(), jwt())).resolves.toMatchObject({
      id,
      aal: 'aal2',
    });
  });
  it.each([
    { exp: 1 },
    { iss: 'https://untrusted.example/auth/v1' },
    { aud: 'other' },
    { sub: 'invalid' },
    { aal: 'admin' },
  ])('rejeita claims inválidas: %j', async (claims) => {
    const service = new SupabaseIdentityService();
    await expect(service.verify(service.client(), jwt(claims))).rejects.toThrow();
  });
  it('rejeita assinatura inválida', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const service = new SupabaseIdentityService();
    await expect(service.verify(service.client(), jwt({}, other.privateKey))).rejects.toThrow();
  });
  it('rejeita usuário removido no provedor mesmo com JWT assinado', async () => {
    const service = new SupabaseIdentityService();
    const client = service.client();
    jest
      .spyOn(client.auth, 'getUser')
      .mockResolvedValue({ data: { user: null }, error: new Error('removed') });
    await expect(service.verify(client, jwt())).rejects.toThrow();
  });
});
describe('Isolamento e criptografia', () => {
  it('não seleciona Auth remoto silenciosamente nem aceita o projeto principal', () => {
    expect(() => authSettings({ SUPABASE_AUTH_URL: 'https://other.supabase.co' })).toThrow();
    expect(() =>
      authSettings({
        AUTH_ENVIRONMENT: 'isolated',
        SUPABASE_AUTH_URL: 'https://qxuqxonpgundilvnajtl.supabase.co',
        AUTH_ISOLATED_PROJECT_CONFIRMATION: 'qxuqxonpgundilvnajtl.supabase.co',
      }),
    ).toThrow();
  });
  it('criptografa tokens e detecta adulteração ou troca entre sessões', () => {
    const key = randomBytes(32).toString('base64');
    const value = { access_token: 'test-only-access', refresh_token: 'test-only-refresh' };
    const cipher = encryptTokens(value, key, sid);
    expect(cipher).not.toContain(value.access_token);
    expect(decryptTokens(cipher, key, sid)).toEqual(value);
    expect(() => decryptTokens(cipher, key, id)).toThrow();
    const bytes = Buffer.from(cipher, 'base64');
    bytes[30] ^= 1;
    expect(() => decryptTokens(bytes.toString('base64'), key, sid)).toThrow();
  });
});
