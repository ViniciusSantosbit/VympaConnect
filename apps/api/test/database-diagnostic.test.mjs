import { describe, it, expect } from '@jest/globals';
import { databaseDiagnostic } from '../scripts/database-diagnostic.mjs';

describe('Diagnóstico PostgreSQL sanitizado', () => {
  it.each([
    ['28P01', 'Autenticação recusada'],
    ['ENOTFOUND', 'DNS'],
    ['ECONNREFUSED', 'TCP'],
    ['ETIMEDOUT', 'Timeout'],
    ['CERT_HAS_EXPIRED', 'TLS'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'hostname'],
    ['VYMPA_CA_FILE', 'CA não encontrado'],
    ['VYMPA_CA_PEM', 'CA inválido'],
  ])('classifica %s sem expor mensagem original', (code, expected) => {
    const text = databaseDiagnostic({ code, message: 'sensitive-secret' });
    expect(text).toContain(expected);
    expect(text).not.toContain('sensitive-secret');
  });
  it('não imprime mensagens, códigos arbitrários, stack ou causas desconhecidas', () => {
    const text = databaseDiagnostic({
      code: 'sensitive-secret',
      message: 'sensitive-secret',
      cause: { message: 'sensitive-secret' },
      stack: 'sensitive-secret',
    });
    expect(text).not.toContain('sensitive-secret');
  });
  it('classifica erros de timeout sem código e falhas agregadas', () => {
    expect(databaseDiagnostic(new Error('timeout sensitive-secret'))).toContain('Timeout');
    expect(databaseDiagnostic({ errors: [{ code: 'ECONNREFUSED' }] })).toContain('TCP');
  });
});
