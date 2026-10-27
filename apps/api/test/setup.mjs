// Pré-carrega os entrypoints ESM antes de plugins CommonJS chamarem require(esm).
// Necessário no runtime de Jest para a interoperabilidade do NestJS 12.
import 'reflect-metadata';
// Nunca herdar configuração real nos testes isolados; nenhum .env é carregado.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/vympa_test';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://localhost:5173';
await import('@nestjs/common');
await import('@nestjs/core');
