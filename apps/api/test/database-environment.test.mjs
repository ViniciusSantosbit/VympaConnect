import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rootCertificates } from 'node:tls';
import {
  assertDatabaseUrl,
  databaseOptions,
  resolveDatabaseCaPath,
} from '../dist/config/database-environment.js';

describe('Isolamento dos ambientes PostgreSQL', () => {
  it('rejeita Supabase em comandos locais sem expor URI', () => {
    expect(() =>
      assertDatabaseUrl('postgresql://user:secret@remote.example:5432/postgres', 'local'),
    ).toThrow('host não local');
  });
  it('aceita somente o Session pooler e projeto configurados', () => {
    const uri =
      'postgresql://postgres.qxuqxonpgundilvnajtl:p%40ss@aws-1-us-west-2.pooler.supabase.com:5432/postgres';
    expect(assertDatabaseUrl(uri, 'supabase').port).toBe('5432');
    expect(() => assertDatabaseUrl(uri.replace(':5432/', ':6543/'), 'supabase')).toThrow();
    expect(() => assertDatabaseUrl(uri + '?sslmode=disable', 'supabase')).toThrow();
  });
  it('não inclui credenciais em erros de parsing', () => {
    expect(() => assertDatabaseUrl('secret')).toThrow('DATABASE_URL inválida');
  });
  it('exige certificado TLS válido no Supabase', () => {
    const previous = process.env.VYMPA_DATABASE_TARGET;
    try {
      process.env.VYMPA_DATABASE_TARGET = 'supabase';
      expect(
        databaseOptions(
          'postgresql://postgres.qxuqxonpgundilvnajtl:test@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
        ).ssl.rejectUnauthorized,
      ).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.VYMPA_DATABASE_TARGET;
      else process.env.VYMPA_DATABASE_TARGET = previous;
    }
  });
  it('mantém opções locais sem TLS obrigatório', () => {
    expect(databaseOptions('postgresql://test:test@localhost:5432/test').ssl).toBeUndefined();
  });
});

describe('Resolução segura do certificado CA', () => {
  it('resolve caminho absoluto nativo sem interpretá-lo como esquema URL', () => {
    const absolute = resolve('certificate with spaces.crt');
    expect(resolveDatabaseCaPath(absolute)).toBe(absolute);
    expect(resolveDatabaseCaPath(pathToFileURL(absolute).href)).toBe(absolute);
  });
  it('resolve caminho relativo à raiz apps/api em src e dist', () => {
    expect(resolveDatabaseCaPath('supabase-ca.crt')).toBe(resolve('supabase-ca.crt'));
  });
  it('lê CA PEM absoluta e rejeita arquivo inválido ou ausente sem expor o caminho', () => {
    const folder = mkdtempSync(join(tmpdir(), 'vympa-ca-'));
    const file = join(folder, 'ca.crt');
    const previousTarget = process.env.VYMPA_DATABASE_TARGET;
    const previousCa = process.env.SUPABASE_SSL_CA_FILE;
    const uri =
      'postgresql://postgres.qxuqxonpgundilvnajtl:test@aws-1-us-west-2.pooler.supabase.com:5432/postgres';
    try {
      process.env.VYMPA_DATABASE_TARGET = 'supabase';
      process.env.SUPABASE_SSL_CA_FILE = file;
      writeFileSync(file, rootCertificates[0]);
      const options = databaseOptions(uri);
      expect(options.ssl.ca).toBe(rootCertificates[0]);
      expect(options.ssl.rejectUnauthorized).toBe(true);
      writeFileSync(file, 'invalid certificate');
      expect(() => databaseOptions(uri)).toThrow('Certificado CA PEM inválido');
      unlinkSync(file);
      expect(() => databaseOptions(uri)).toThrow('Não foi possível ler SUPABASE_SSL_CA_FILE');
    } finally {
      try {
        unlinkSync(file);
      } catch {
        /* Arquivo já removido pelo teste. */
      }
      rmdirSync(folder);
      if (previousTarget === undefined) delete process.env.VYMPA_DATABASE_TARGET;
      else process.env.VYMPA_DATABASE_TARGET = previousTarget;
      if (previousCa === undefined) delete process.env.SUPABASE_SSL_CA_FILE;
      else process.env.SUPABASE_SSL_CA_FILE = previousCa;
    }
  });
});
