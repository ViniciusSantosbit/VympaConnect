// Pré-carrega os entrypoints ESM antes de plugins CommonJS chamarem require(esm).
// Necessário no runtime de Jest para a interoperabilidade do NestJS 12.
import 'reflect-metadata';
await import('@nestjs/common');
await import('@nestjs/core');
