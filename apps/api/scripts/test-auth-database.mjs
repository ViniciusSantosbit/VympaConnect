import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
let db;
const rollback = new Error('ROLLBACK_TEST_ONLY');
try {
  if (process.env.VYMPA_DATABASE_TARGET && process.env.VYMPA_DATABASE_TARGET !== 'local')
    throw new Error();
  process.env.VYMPA_DATABASE_TARGET = 'local';
  loadDatabaseEnvironment();
  db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(process.env.DATABASE_URL)) });
  try {
    await db.$transaction(async (tx) => {
      const identityId = randomUUID();
      const owner = await tx.adminProfile.create({
        data: { identityId, email: 'test-' + identityId + '@example.invalid', role: 'OWNER' },
      });
      const invitedId = randomUUID();
      const invite = await tx.adminInvitation.create({
        data: {
          email: 'test-' + invitedId + '@example.invalid',
          identityId: invitedId,
          issuedById: owner.id,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      const consume = () =>
        tx.adminInvitation.updateMany({
          where: {
            id: invite.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date() },
        });
      assert.equal((await consume()).count, 1);
      assert.equal((await consume()).count, 0);
      await tx.adminAuditEvent.create({
        data: { actorId: owner.id, action: 'INTEGRATION_TEST_ROLLED_BACK', targetId: invite.id },
      });
      const tables =
        await tx.$queryRaw`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'vympa_private' AND c.relkind = 'r'`;
      assert.equal(tables.length, 5);
      assert.ok(tables.every((table) => table.relrowsecurity));
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log(
    'Integração PostgreSQL local: perfis, convites de uso único, auditoria e RLS aprovados. Fixtures revertidas por rollback; nenhuma identidade Auth criada.',
  );
} catch {
  console.error(
    'Integração PostgreSQL local não validada. Configure .env, inicie Docker e aplique as migrations locais.',
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
