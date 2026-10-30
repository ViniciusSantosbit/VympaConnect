import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service.js';

// Janela fixa e bloqueio persistidos; transação serializa instâncias da API.
@Injectable()
export class DatabaseThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly db: DatabaseService) {}
  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    const storageKey =
      'rate:' +
      createHash('sha256')
        .update(name + ':' + key)
        .digest('hex');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${storageKey}, 0))`;
      const now = Date.now();
      const row = await tx.systemMetadata.findUnique({ where: { key: storageKey } });
      let state = row
        ? (JSON.parse(row.value) as { hits: number; expires: number; blocked: number })
        : { hits: 0, expires: now + ttl, blocked: 0 };
      if (state.blocked <= now && (state.blocked > 0 || state.expires <= now))
        state = { hits: 0, expires: now + ttl, blocked: 0 };
      if (state.blocked <= now) {
        state.hits++;
        if (state.hits > limit) state.blocked = Math.max(state.expires, now + blockDuration);
      }
      await tx.systemMetadata.upsert({
        where: { key: storageKey },
        create: { key: storageKey, value: JSON.stringify(state) },
        update: { value: JSON.stringify(state) },
      });
      return {
        totalHits: state.hits,
        timeToExpire: Math.max(0, Math.ceil((state.expires - now) / 1000)),
        isBlocked: state.blocked > now,
        timeToBlockExpire: Math.max(0, Math.ceil((state.blocked - now) / 1000)),
      };
    });
  }
}
