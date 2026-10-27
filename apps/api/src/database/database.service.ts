import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseOptions } from '../config/database-environment.js';
import { PrismaClient } from '../generated/prisma/client.js';
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg(databaseOptions(config.getOrThrow<string>('DATABASE_URL'))),
    });
  }
  async onModuleInit() {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
