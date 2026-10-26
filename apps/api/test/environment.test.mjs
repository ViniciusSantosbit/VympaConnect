import { describe, it, expect } from '@jest/globals';
import { validateEnvironment } from '../dist/config/environment.js';
describe('Validação de configuração', () => {
  const valid = { DATABASE_URL: 'postgresql://local:local@localhost:5432/local' };
  it('não exige credenciais de integrações futuras', () => {
    expect(validateEnvironment(valid).PORT).toBe(3000);
  });
  it('rejeita URL de banco inválida', () => {
    expect(() => validateEnvironment({ ...valid, DATABASE_URL: 'https://example.com' })).toThrow();
  });
  it('rejeita CORS aberto', () => {
    expect(() => validateEnvironment({ ...valid, CORS_ORIGINS: '*' })).toThrow();
  });
  it('impede uso em produção nesta etapa', () => {
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow(
      /não autorizada/,
    );
  });
});
