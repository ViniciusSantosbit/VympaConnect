import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './config/configure-app.js';
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let handler: Promise<Handler> | undefined;
async function createHandler(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}
// Entrypoint da Vercel: a mesma aplicação de main.ts, sem listen, reutilizada entre invocações.
export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  handler ??= createHandler().catch((error: unknown) => {
    handler = undefined;
    throw error;
  });
  (await handler)(req, res);
}
