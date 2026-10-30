import { describe, it, expect, jest } from '@jest/globals';
import { DatabaseThrottlerStorage } from '../dist/config/database-throttler.js';
function store() {
  const rows = new Map();
  const tx = {
    $queryRaw: jest.fn(async () => []),
    systemMetadata: {
      findUnique: jest.fn(async ({ where }) => rows.get(where.key) ?? null),
      upsert: jest.fn(async ({ where, create, update }) => {
        rows.set(where.key, rows.has(where.key) ? update : create);
      }),
    },
  };
  return { db: { $transaction: async (fn) => fn(tx) }, tx, rows };
}
describe('Rate limit persistente', () => {
  it('compartilha contadores entre instâncias, bloqueia e não persiste IP em claro', async () => {
    const { db, tx, rows } = store();
    const a = new DatabaseThrottlerStorage(db),
      b = new DatabaseThrottlerStorage(db);
    expect((await a.increment('192.0.2.1', 60000, 1, 60000, 'login')).isBlocked).toBe(false);
    expect((await b.increment('192.0.2.1', 60000, 1, 60000, 'login')).isBlocked).toBe(true);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect([...rows.keys()][0]).not.toContain('192.0.2.1');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.systemMetadata.findUnique.mock.invocationCallOrder[0],
    );
  });
  it('recusa a requisição se persistência falhar em vez de usar memória', async () => {
    const db = {
      $transaction: async () => {
        throw new Error('offline');
      },
    };
    await expect(
      new DatabaseThrottlerStorage(db).increment('key', 1000, 1, 1000, 'login'),
    ).rejects.toThrow('offline');
  });
  it('reinicia somente após expirar a janela e o bloqueio', async () => {
    const { db } = store();
    const a = new DatabaseThrottlerStorage(db);
    const spy = jest.spyOn(Date, 'now');
    try {
      spy.mockReturnValue(1000);
      await a.increment('key', 1000, 1, 2000, 'login');
      expect((await a.increment('key', 1000, 1, 2000, 'login')).isBlocked).toBe(true);
      spy.mockReturnValue(2500);
      expect((await a.increment('key', 1000, 1, 2000, 'login')).isBlocked).toBe(true);
      spy.mockReturnValue(3001);
      expect((await a.increment('key', 1000, 1, 2000, 'login')).isBlocked).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
