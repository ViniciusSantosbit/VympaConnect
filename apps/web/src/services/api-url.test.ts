import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from './api-url';
describe('Destino da API por ambiente', () => {
  it('usa a mesma origem em produção sem configuração', () => {
    expect(resolveApiUrl(undefined, true)).toBe('/api/v1');
    expect(resolveApiUrl('/api/v1', true)).toBe('/api/v1');
  });
  it('preserva o servidor local em desenvolvimento', () => {
    expect(resolveApiUrl(undefined, false)).toBe('http://127.0.0.1:3000/api/v1');
  });
  it('aceita API HTTPS explícita', () => {
    expect(resolveApiUrl('https://api.example.com/api/v1', true)).toBe(
      'https://api.example.com/api/v1',
    );
  });
  it.each([
    '//evil.example/api/v1',
    'https://user:secret@api.example.com/api/v1',
    'http://api.example.com/api/v1',
    'https://localhost/api/v1',
    'https://api.example.com/api/v1?token=secret',
    'https://api.example.com/api/v1#secret',
    'https://api.example.com/other',
    'javascript:alert(1)',
  ])('recusa destino inseguro em produção: %s', (value) => {
    expect(() => resolveApiUrl(value, true)).toThrow('VITE_API_URL inválida');
  });
});
