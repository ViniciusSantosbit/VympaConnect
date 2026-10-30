import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './config/configure-app.js';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  const config = app.get(ConfigService);
  if (config.get('NODE_ENV') === 'development') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VYMPA Connect API')
        .setDescription('Autenticação administrativa Supabase, MFA e autorização por perfil ativo.')
        .setVersion('1.0')
        .addCookieAuth('vympa_session')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('PORT'), config.getOrThrow<string>('HOST'));
}
bootstrap().catch(() => {
  console.error('Falha ao iniciar a API. Verifique ambiente e disponibilidade do PostgreSQL.');
  process.exitCode = 1;
});
