import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { loadDatabaseEnvironment } from './config/database-environment.js';
loadDatabaseEnvironment();
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule, CsrfGuard } from './modules/auth/auth.module.js';
import { JwtSessionGuard, RolesGuard } from './modules/auth/auth.guards.js';
import { AdminUsersModule } from './modules/admin-users/admin-users.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ProspectingModule } from './modules/prospecting/prospecting.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('LOG_LEVEL'),
          genReqId: () => randomUUID(),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body',
              'res.body',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            req: (req: { id?: string; method?: string; url?: string }) => ({
              id: req.id,
              method: req.method,
              path: req.url?.split('?')[0],
            }),
          },
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    DashboardModule,
    ProspectingModule,
    AuthModule,
    AdminUsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
