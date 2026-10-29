import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter.js';
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.use(helmet());
  app.use(
    (
      request: import('express').Request,
      response: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      if (
        /^\/api\/v1\/(auth|admin|prospecting|dashboard|finance|clients|contracts|goals)(\/|$)/.test(
          request.path,
        )
      )
        response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)));
}
