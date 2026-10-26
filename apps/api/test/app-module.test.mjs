import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../dist/app.module.js';
import { DatabaseService } from '../dist/database/database.service.js';
import { configureApp } from '../dist/config/configure-app.js';

describe('Composição completa da API', () => {
  it('resolve providers reais, configura filtros e gera OpenAPI sem conectar banco neste teste', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    process.env.LOG_LEVEL = 'silent';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .compile();
    const app = module.createNestApplication({ bufferLogs: true });
    try {
      app.useLogger(app.get(Logger));
      configureApp(app);
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Test').setVersion('1').build(),
      );
      expect(document.paths['/api/v1/health']).toBeDefined();
      await app.init();
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(response.body).toEqual({ status: 'ok', service: 'vympa-connect-api' });
    } finally {
      await app.close();
    }
  });
});
