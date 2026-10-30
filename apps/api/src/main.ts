import 'reflect-metadata';
// Pré-carregar os entrypoints ESM antes dos plugins CommonJS.
await import('@nestjs/common');
await import('@nestjs/core');
await import('./bootstrap.js');
