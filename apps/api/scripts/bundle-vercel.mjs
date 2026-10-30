// O loader da Vercel não suporta require() de ESM; o bundle elimina esses requires
// (ex.: @nestjs/throttler e nestjs-pino carregando @nestjs/common).
import { build } from 'esbuild';
await build({
  entryPoints: ['dist/serverless.js'],
  outfile: 'dist/vercel.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  keepNames: true,
  logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: [
    'argon2',
    'pg-native',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    'class-transformer/storage',
    '@fastify/static',
    'pino-pretty',
  ],
});
