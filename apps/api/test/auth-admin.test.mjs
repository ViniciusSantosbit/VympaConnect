import { describe, it, expect } from '@jest/globals';
import {
  parseAdminOptions,
  assertLocalAdminTargets,
  assertBootstrapIdentity,
  safeAdminDiagnostic,
} from '../scripts/auth-admin-support.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const confirmation = '--confirm=BOOTSTRAP_LOCAL_OWNER';
const settings = { mode: 'local', url: 'http://127.0.0.1:54321' };
const database = 'postgresql://test:test@localhost:5432/vympa_connect';
const user = { id, email: 'owner@example.invalid', email_confirmed_at: '2026-01-01' };

describe('CLI administrativa local', () => {
  it('preserva os argumentos encaminhados pelos scripts npm', () => {
    expect(parseAdminOptions('bootstrap-owner', [`--identity=${id}`, confirmation])).toEqual({
      identity: id,
      confirm: 'BOOTSTRAP_LOCAL_OWNER',
    });
    expect(
      parseAdminOptions('bootstrap-owner', ['--identity', id, '--confirm', 'BOOTSTRAP_LOCAL_OWNER'])
        .identity,
    ).toBe(id);
  });

  it.each([
    [],
    [`--identity=${id}`],
    ['--identity=invalid', confirmation],
    [`--identity=${id}`, '--confirm=wrong'],
    [`--identity=${id}`, confirmation, '--role=OWNER'],
    [`--identity=${id}`, confirmation, `--identity=${id}`],
    [`--identity=${id}`, confirmation, 'unexpected'],
  ])('recusa argumentos ausentes, inválidos ou ambíguos: %j', (...args) => {
    expect(() => parseAdminOptions('bootstrap-owner', args)).toThrow('Argumentos inválidos');
  });

  it('mantém a confirmação e os argumentos da recuperação MFA', () => {
    expect(
      parseAdminOptions('recover-mfa', [
        `--request=${id}`,
        '--case=INCIDENTE-123',
        '--confirm=RESET_MFA_AFTER_IDENTITY_VERIFICATION',
      ]).request,
    ).toBe(id);
    expect(() => parseAdminOptions('recover-mfa', [`--request=${id}`])).toThrow();
  });

  it('aceita exclusivamente os serviços locais previstos', () => {
    expect(() => assertLocalAdminTargets(settings, database, 'development')).not.toThrow();
  });

  it.each([
    [
      { ...settings, mode: 'isolated', url: 'https://example.supabase.co' },
      database,
      'development',
    ],
    [settings, database.replace('localhost', 'remote.example'), 'development'],
    [settings, database.replace(':5432', ':54322'), 'development'],
    [settings, database.replace('vympa_connect', 'postgres'), 'development'],
    [{ ...settings, url: 'http://127.0.0.1:9999' }, database, 'development'],
    [settings, database, 'production'],
  ])('bloqueia destino remoto, banco incorreto e produção', (auth, db, environment) => {
    expect(() => assertLocalAdminTargets(auth, db, environment)).toThrow('Destino bloqueado');
  });

  it('aceita identidade confirmada e correspondente ao UUID solicitado', () => {
    expect(() => assertBootstrapIdentity(user, id)).not.toThrow();
  });

  it.each([
    null,
    { ...user, id: '22222222-2222-4222-8222-222222222222' },
    { ...user, email_confirmed_at: null },
    { ...user, email: '' },
    { ...user, is_anonymous: true },
    { ...user, deleted_at: '2026-01-01' },
    { ...user, banned_until: '2999-01-01' },
  ])('recusa identidade ausente ou inapta', (identity) => {
    expect(() => assertBootstrapIdentity(identity, id)).toThrow();
  });

  it('não divulga mensagens brutas de drivers ou do provedor', () => {
    const error = Object.assign(new Error('SECRET_TOKEN_AND_DATABASE_PASSWORD'), { code: 'P2010' });
    expect(safeAdminDiagnostic(error, 'Transação')).toContain('Falha SQL');
    expect(safeAdminDiagnostic(error, 'Transação')).not.toContain('SECRET');
    expect(safeAdminDiagnostic(new Error('SECRET'), 'Auth')).not.toContain('SECRET');
    expect(safeAdminDiagnostic({ code: 'EACCES' }, 'Banco')).toContain('negado');
  });
});
