import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { HealthService } from '../dist/modules/health/health.service.js';
import { HealthModule } from '../dist/modules/health/health.module.js';
import { configureApp } from '../dist/config/configure-app.js';
describe('HealthService', () => {
  it('retorna o contrato público sem dados sensíveis', () => {
    expect(new HealthService().getStatus()).toEqual({ status: 'ok', service: 'vympa-connect-api' });
  });
});
describe('HTTP de health com controles globais', () => {
  let app;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [HealthModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: ConfigService,
          useValue: new ConfigService({ CORS_ORIGINS: ['http://localhost:5173'] }),
        },
        { provide: Logger, useValue: { error: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('GET /api/v1/health responde com headers seguros e CORS restrito', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok', service: 'vympa-connect-api' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('não autoriza uma origem externa', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('normaliza erros 404 sem stack trace', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/missing').expect(404);
    expect(response.body.statusCode).toBe(404);
    expect(response.body.stack).toBeUndefined();
  });
  it('aplica rate limiting ao health público', async () => {
    for (let i = 0; i < 6; i++) await request(app.getHttpServer()).get('/api/v1/health');
    await request(app.getHttpServer()).get('/api/v1/health').expect(429);
  });
});
