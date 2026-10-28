import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
import { ProspectingService } from '../dist/modules/prospecting/prospecting.service.js';
import { DashboardService } from '../dist/modules/dashboard/dashboard.module.js';
process.env.VYMPA_DATABASE_TARGET = 'local';
loadDatabaseEnvironment();
const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.port, '5432');
assert.equal(url.pathname, '/vympa_connect');
const db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(process.env.DATABASE_URL)) });
const rollback = new Error('ROLLBACK_FIXTURES');
try {
  const before = await db.lead.count();
  try {
    await db.$transaction(
      async (tx) => {
        const actor = await tx.adminProfile.findFirst({ where: { active: true } });
        assert.ok(actor, 'Administrador local ativo necessario para testar sem criar contas.');
        const scoped = new Proxy(tx, {
          get: (target, key) =>
            key === '$transaction'
              ? (value) => (typeof value === 'function' ? value(tx) : Promise.all(value))
              : target[key],
        });
        const service = new ProspectingService(scoped);
        const placeId = 'test_rollback_' + randomUUID();
        const lead = await service.create(
          { placeId, segment: 'ADVOCACIA', state: 'DF', city: 'Brasília' },
          actor.id,
        );
        assert.equal(lead.companyName, null);
        assert.equal(lead.externalReference.placeId, placeId);
        await tx.$executeRaw`SAVEPOINT duplicate_fixture`;
        await assert.rejects(
          () => service.create({ placeId, segment: 'ADVOCACIA' }, actor.id),
          (error) => error.status === 409,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT duplicate_fixture`;
        await service.update(
          lead.id,
          {
            assigneeId: actor.id,
            email: 'fixture@example.invalid',
            nextAction: 'Contato de teste isolado',
          },
          actor.id,
        );
        await service.status(
          lead.id,
          { status: 'NEGOTIATING', observation: 'Fixture isolada' },
          actor.id,
        );
        await service.event(lead.id, { body: 'Nota isolada' }, actor.id, 'NOTE');
        await service.event(
          lead.id,
          { body: 'Contato isolado', channel: 'PHONE' },
          actor.id,
          'INTERACTION',
        );
        await service.followUp(
          lead.id,
          { action: 'Follow-up isolado', dueAt: new Date(Date.now() + 86400000).toISOString() },
          actor.id,
        );
        let saved = await service.get(lead.id);
        assert.equal(saved.status, 'NEGOTIATING');
        assert.ok(saved.lastContactAt);
        assert.equal(saved.followUps.length, 1);
        assert.ok(saved.events.some((e) => e.kind === 'NOTE'));
        assert.ok(
          saved.events.some(
            (e) => e.previousStatus === 'NOT_CONTACTED' && e.newStatus === 'NEGOTIATING',
          ),
        );
        await service.completeFollowUp(lead.id, saved.followUps[0].id, actor.id);
        await service.status(lead.id, { status: 'LOST', lossReason: 'Motivo isolado' }, actor.id);
        saved = await service.get(lead.id);
        assert.equal(saved.lossReason, 'Motivo isolado');
        assert.ok(saved.followUps[0].completedAt);
        const listed = await service.list({
          status: 'LOST',
          assigneeId: actor.id,
          query: placeId,
          page: 1,
        });
        assert.equal(listed.total, 1);
        const summary = await new DashboardService(scoped).summary(actor.id, actor.identityId);
        assert.ok(summary.prospecting.lost >= 1);
        assert.equal(summary.metrics.closedContracts, null);
        const rls =
          await tx.$queryRaw`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='vympa_private' AND c.relname IN ('leads','place_references','lead_events','lead_follow_ups','places_usage')`;
        assert.equal(rls.length, 5);
        assert.ok(rls.every((r) => r.relrowsecurity));
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  }
  assert.equal(await db.lead.count(), before);
  console.log(
    'PostgreSQL local: persistencia, Place ID unico, responsavel, status, notas, contatos, acompanhamentos, dashboard e RLS aprovados. Todas as fixtures revertidas. Nenhuma chamada Google.',
  );
} catch (error) {
  console.error('Integracao CRM falhou:', error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
