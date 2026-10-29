import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { loadDatabaseEnvironment } from '../src/config/database-environment.ts';
import { GoalsService } from '../dist/modules/goals/goals.service.js';
import { GoalMetricsService } from '../dist/modules/goals/goal-metrics.service.js';
import { GoalProgressService } from '../dist/modules/goals/goal-progress.service.js';
import { GoalAnalyticsService } from '../dist/modules/goals/goal-analytics.service.js';
process.env.VYMPA_DATABASE_TARGET = 'local';
loadDatabaseEnvironment();
const base = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
assert.equal(base.port, '5432');
assert.equal(base.pathname, '/vympa_connect');
const name = 'vympa_script08_test_' + randomUUID().replaceAll('-', '');
assert.match(name, /^vympa_script08_test_[a-f0-9]{32}$/);
const control = new pg.Client({ connectionString: base.toString(), connectionTimeoutMillis: 5000 });
let db,
  setup,
  created = false;
const at = (d = '2026-02-10') => new Date(d + 'T15:00:00Z'),
  date = (d) => new Date(d + 'T00:00:00Z');
const c = { startsOn: '2026-02-01', endsOn: '2026-02-28' };
const rejects = (fn, status) => assert.rejects(fn, (e) => e.status === status);
try {
  await control.connect();
  await control.query('CREATE DATABASE "' + name + '"');
  created = true;
  const url = new URL(base);
  url.pathname = '/' + name;
  setup = new pg.Client({ connectionString: url.toString() });
  await setup.connect();
  for (const folder of readdirSync(new URL('../prisma/migrations/', import.meta.url))
    .filter((n) => /^\d/.test(n))
    .sort())
    await setup.query(
      readFileSync(
        new URL('../prisma/migrations/' + folder + '/migration.sql', import.meta.url),
        'utf8',
      ),
    );
  await setup.end();
  setup = null;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const metrics = new GoalMetricsService(db),
    goals = new GoalsService(db, metrics, new GoalProgressService()),
    analytics = new GoalAnalyticsService(db, metrics, goals);
  const owner = await db.adminProfile.create({
      data: { identityId: randomUUID(), email: 'owner@example.invalid', role: 'OWNER' },
    }),
    admin = await db.adminProfile.create({
      data: { identityId: randomUUID(), email: 'admin@example.invalid', role: 'ADMIN' },
    }),
    other = await db.adminProfile.create({
      data: { identityId: randomUUID(), email: 'other@example.invalid', role: 'ADMIN' },
    });
  const leads = [];
  for (const d of ['2026-02-01', '2026-02-02', '2026-02-03', '2026-01-01'])
    leads.push(
      await db.lead.create({
        data: {
          companyName: 'Fixture ' + d,
          segment: 'ADVOCACIA',
          createdById: owner.id,
          assigneeId: admin.id,
          status: 'LOST',
          createdAt: at(d),
        },
      }),
    );
  const event = (leadId, kind, extra = {}) =>
    db.leadEvent.create({ data: { leadId, actorId: owner.id, kind, createdAt: at(), ...extra } });
  await event(leads[0].id, 'INTERACTION');
  await event(leads[0].id, 'INTERACTION', { actorId: admin.id });
  await event(leads[1].id, 'NOTE', { body: 'Reunião textual não deve contar' });
  await event(leads[1].id, 'STATUS', { newStatus: 'CONTACTED' });
  await event(leads[1].id, 'STATUS', { newStatus: 'NEGOTIATING' });
  await event(leads[0].id, 'STATUS', { newStatus: 'WON' });
  await event(leads[0].id, 'STATUS', { newStatus: 'WON', createdAt: at('2026-02-11') });
  await event(leads[0].id, 'CLIENT_LINKED');
  await event(leads[3].id, 'CLIENT_LINKED');
  await event(leads[0].id, 'FOLLOW_UP_DONE');
  const value = async (code, extra = {}) =>
    (await metrics.calculate(code, { ...c, ...extra })).value;
  assert.equal(await value('NEW_LEADS'), '3');
  assert.equal(await value('NEW_LEADS', { responsibleIds: [owner.id, admin.id] }), '3');
  assert.equal(await value('CONTACTED_LEADS'), '1');
  assert.equal(await value('CONTACTED_LEADS', { responsibleIds: [owner.id, admin.id] }), '1');
  assert.equal(await value('WON_NEGOTIATIONS'), '1');
  assert.equal(await value('NEGOTIATIONS_STARTED'), '1');
  assert.equal(await value('COMPLETED_ACTIVITIES'), '1');
  assert.equal(await value('CONVERSION_RATE'), '33.3333');
  assert.equal(await value('CONVERSION_RATE', { responsibleIds: [admin.id] }), null);
  assert.equal(await value('MEETINGS'), null);
  const proposal = await db.proposal.create({
    data: {
      companyName: 'Fixture',
      segment: 'ADVOCACIA',
      responsibleId: owner.id,
      createdById: owner.id,
      simulationDate: date(c.startsOn),
      input: {},
      result: {},
      status: 'REJECTED',
      createdAt: at(),
      versions: {
        create: [1, 2].map((version) => ({
          version,
          snapshot: { status: 'SENT', segment: 'ADVOCACIA', responsibleId: owner.id },
          createdAt: at(),
        })),
      },
    },
  });
  assert.ok(proposal.id);
  assert.equal(await value('SENT_PROPOSALS'), '1');
  assert.equal(await value('SENT_PROPOSALS', { responsibleIds: [admin.id] }), '0');
  const client = await db.client.create({
    data: {
      companyName: 'Cliente isolado',
      segment: 'ADVOCACIA',
      responsibleId: admin.id,
      createdAt: at('2026-02-01'),
      activities: {
        create: [
          {
            actorId: owner.id,
            kind: 'CLIENT_CREATED',
            body: 'Criação',
            createdAt: at('2026-02-01'),
          },
          {
            actorId: admin.id,
            kind: 'LEAD_CONVERTED',
            body: 'Outro vínculo',
            createdAt: at('2026-02-02'),
          },
        ],
      },
    },
  });
  assert.equal(await value('NEW_CLIENTS'), '1');
  assert.equal(await value('NEW_CLIENTS', { responsibleIds: [admin.id] }), '0');
  assert.equal(await value('NEW_CLIENTS', { responsibleIds: [owner.id] }), '1');
  const contract = await db.contract.create({
    data: {
      requestKey: randomUUID(),
      number: 'FIXTURE-08',
      clientId: client.id,
      title: 'Fixture',
      responsibleId: owner.id,
      startsOn: date('2026-02-01'),
      endsOn: date('2026-12-31'),
      setupCents: 0,
      monthlyCents: 10001,
      status: 'TERMINATED',
      createdAt: at('2026-02-01'),
    },
  });
  const snap = (status) => ({
    status,
    startsOn: '2026-02-01',
    endsOn: '2026-12-31',
    monthlyCents: 10001,
    billingPeriod: 'MONTHLY',
  });
  for (const [status, day] of [
    ['DRAFT', '2026-02-01'],
    ['SIGNED', '2026-02-03'],
    ['ACTIVE', '2026-02-04'],
    ['ACTIVE', '2026-02-05'],
    ['TERMINATED', '2026-03-01'],
  ])
    await db.contractStatusHistory.create({
      data: {
        contractId: contract.id,
        actorId: owner.id,
        kind: status === 'DRAFT' ? 'CONTRACT_DRAFT_CREATED' : 'CONTRACT_STATUS_CHANGED',
        reason: 'Fixture',
        after: snap(status),
        createdAt: at(day),
      },
    });
  await db.contractAmendment.create({
    data: {
      contractId: contract.id,
      actorId: owner.id,
      requestKey: randomUUID(),
      previousMonthlyCents: 10001,
      monthlyCents: 11001,
      effectiveOn: date('2026-02-20'),
      reason: 'Fixture',
      createdAt: at('2026-02-15'),
    },
  });
  assert.equal(await value('SIGNED_CONTRACTS'), '1');
  assert.equal(await value('ACTIVATED_CONTRACTS'), '1');
  assert.equal(await value('CONTRACTED_MRR', { asOf: '2026-02-19' }), '10001');
  assert.equal(await value('CONTRACTED_MRR', { asOf: '2026-02-28' }), '11001');
  assert.equal(
    await metrics
      .calculate('CONTRACTED_MRR', {
        startsOn: '2026-03-01',
        endsOn: '2026-03-31',
        asOf: '2026-03-31',
      })
      .then((r) => r.value),
    '0',
  );
  const general = await db.financialCategory.findFirst({ where: { name: 'Receitas de serviços' } }),
    ai = await db.financialCategory.findFirst({ where: { group: 'AI' } }),
    infra = await db.financialCategory.findFirst({ where: { group: 'INFRA' } });
  const entry = async (type, amountCents, status, category, day = '2026-02-10') =>
    db.financialTransaction.create({
      data: {
        requestKey: randomUUID(),
        description: 'Fixture isolada',
        type,
        amountCents,
        status,
        categoryId: category.id,
        categoryGroup: category.group,
        createdById: owner.id,
        clientId: client.id,
        competenceOn: date(day),
        dueOn: date(day),
        settledOn: status === 'SETTLED' ? date(day) : null,
        createdAt: at('2026-02-01'),
      },
    });
  await entry('INCOME', 10001, 'SETTLED', general);
  await entry('INCOME', 20002, 'SETTLED', general);
  await entry('INCOME', 70000, 'PENDING', general);
  await entry('EXPENSE', 10000, 'SETTLED', ai);
  const invEntry = await entry('EXPENSE', 5000, 'SETTLED', infra);
  await entry('INCOME', 12345, 'CANCELLED', general);
  await entry('INCOME', 10000, 'SETTLED', general, '2026-01-15');
  assert.equal(await value('RECEIVED_INCOME'), '30003');
  assert.equal(await value('EXPECTED_INCOME'), '70000');
  assert.equal(await value('EXPECTED_INCOME', { asOf: '2026-02-28' }), null);
  assert.equal(await value('PAID_EXPENSES'), '15000');
  assert.equal(await value('PAID_AI_COSTS'), '10000');
  assert.equal(await value('PAID_INFRA_COSTS'), '5000');
  assert.equal(await value('CASH_RESULT'), '15003');
  assert.equal(await value('RECEIVED_INCOME', { segment: 'CONTABILIDADE' }), '0');
  assert.equal(await value('MONTHLY_GROWTH'), '200.0300');
  assert.equal(await value('RECEIVED_SERVICE'), null);
  await db.investment.create({
    data: {
      name: 'Previsto isolado',
      createdAt: at('2026-02-01'),
      estimatedCents: 50000,
      priority: 'LOW',
      status: 'PLANNED',
      plannedOn: date('2026-02-10'),
      categoryId: infra.id,
      responsibleId: owner.id,
    },
  });
  await db.investment.create({
    data: {
      name: 'Pago isolado',
      estimatedCents: 5000,
      actualCents: 5000,
      priority: 'LOW',
      status: 'PAID',
      plannedOn: date('2026-02-10'),
      categoryId: infra.id,
      responsibleId: owner.id,
      transactionId: invEntry.id,
    },
  });
  assert.equal(await value('PLANNED_INVESTMENTS'), '50000');
  assert.equal(await value('EXECUTED_INVESTMENTS'), '5000');
  const currentDay = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const future = new Date(date(currentDay).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  await db.investment.create({
    data: {
      name: 'Previsão futura isolada',
      estimatedCents: 25000,
      priority: 'LOW',
      status: 'PLANNED',
      plannedOn: date(future),
      categoryId: infra.id,
      responsibleId: owner.id,
    },
  });
  assert.equal(
    (await metrics.calculate('PLANNED_INVESTMENTS', { startsOn: currentDay, endsOn: future }))
      .value,
    '25000',
  );
  const dto = {
    requestKey: randomUUID(),
    title: 'Meta real em banco descartável',
    category: 'COMMERCIAL',
    metric: 'NEW_LEADS',
    mode: 'AUTO',
    direction: 'GROWTH',
    target: '2',
    ...c,
    priority: 'HIGH',
    periodicity: 'CUSTOM',
    scope: 'ASSIGNED',
    assigneeIds: [owner.id, admin.id],
    adminVisible: false,
    allowManualUpdates: false,
    alertDays: 7,
  };
  const concurrent = await Promise.all([1, 2].map(() => goals.create(dto, owner.id, 'OWNER')));
  assert.equal(concurrent[0].id, concurrent[1].id);
  let goal = await goals.get(concurrent[0].id, owner.id, 'OWNER');
  assert.equal(goal.progress.percent, 150);
  assert.equal(goal.progress.barPercent, 100);
  assert.equal(goal.progress.status, 'ACHIEVED');
  await rejects(
    () =>
      goals.manual(
        goal.id,
        {
          version: goal.version,
          requestKey: randomUUID(),
          value: '9999',
          observedOn: '2026-02-15',
          reason: 'Tentativa inválida',
        },
        owner.id,
        'OWNER',
      ),
    400,
  );
  await rejects(() => goals.get(goal.id, other.id, 'ADMIN'), 404);
  assert.equal((await goals.get(goal.id, admin.id, 'ADMIN')).progress.value, '3');
  await goals.edit(
    goal.id,
    {
      version: goal.version,
      title: 'Título revisado',
      segment: null,
      reason: 'Revisão justificada',
    },
    owner.id,
    'OWNER',
  );
  await rejects(
    () =>
      goals.edit(
        goal.id,
        { version: goal.version, title: 'Conflito', reason: 'Revisão atrasada' },
        owner.id,
        'OWNER',
      ),
    409,
  );
  let manual = await goals.create(
    {
      ...dto,
      requestKey: randomUUID(),
      title: 'Objetivo manual',
      category: 'TEAM',
      metric: 'CUSTOM_ACTIVITY',
      mode: 'MANUAL',
      target: '2.25',
      allowManualUpdates: true,
    },
    owner.id,
    'OWNER',
  );
  const update = {
    version: manual.version,
    requestKey: randomUUID(),
    value: '1.125',
    observedOn: '2026-02-15',
    reason: 'Atividade observada em fixture isolada',
  };
  const updates = await Promise.all(
    [1, 2].map(() => goals.manual(manual.id, update, admin.id, 'ADMIN')),
  );
  assert.equal(updates[0].id, updates[1].id);
  manual = await goals.get(manual.id, owner.id, 'OWNER');
  assert.equal(manual.progress.percent, 50);
  assert.equal(manual.progress.remaining, '1.125');
  assert.equal(await db.goalManualUpdate.count({ where: { goalId: manual.id } }), 1);
  await goals.comment(manual.id, 'Comentário auditável', admin.id, 'ADMIN');
  await goals.action(
    manual.id,
    { version: manual.version, blocked: true, reason: 'Impedimento de teste' },
    admin.id,
    'ADMIN',
  );
  manual = await goals.get(manual.id, owner.id, 'OWNER');
  assert.equal(manual.blocked, true);
  await goals.snapshot(manual.id, admin.id, 'ADMIN');
  assert.equal(await db.goalProgressSnapshot.count(), 1);
  const fin = await goals.create(
    {
      ...dto,
      requestKey: randomUUID(),
      title: 'Receita privada',
      category: 'FINANCIAL',
      metric: 'RECEIVED_INCOME',
      scope: 'COMPANY',
      target: '30003',
      adminVisible: true,
    },
    owner.id,
    'OWNER',
  );
  await rejects(() => goals.get(fin.id, admin.id, 'ADMIN'), 404);
  assert.equal((await goals.get(fin.id, owner.id, 'OWNER')).progress.percent, 100);
  const adminList = await goals.list({ page: 1 }, admin.id, 'ADMIN');
  assert.ok(adminList.items.every((g) => g.category !== 'FINANCIAL'));
  assert.equal((await goals.summary(admin.id, 'ADMIN')).financialInProgress, null);
  await goals.action(
    manual.id,
    { version: manual.version, reason: 'Cancelamento auditável' },
    owner.id,
    'OWNER',
    true,
  );
  assert.equal((await goals.get(manual.id, owner.id, 'OWNER')).progress.status, 'CANCELLED');
  assert.ok((await goals.history(manual.id, admin.id, 'ADMIN', 1)).length >= 4);
  const limit = await goals.create(
    {
      ...dto,
      requestKey: randomUUID(),
      title: 'Limite de despesas',
      category: 'FINANCIAL',
      metric: 'PAID_EXPENSES',
      direction: 'LIMIT',
      scope: 'COMPANY',
      target: '20000',
    },
    owner.id,
    'OWNER',
  );
  assert.equal((await goals.get(limit.id, owner.id, 'OWNER')).progress.status, 'ACHIEVED');
  const reduction = await goals.create(
    {
      ...dto,
      requestKey: randomUUID(),
      title: 'Redução de despesas',
      category: 'FINANCIAL',
      metric: 'PAID_EXPENSES',
      direction: 'REDUCTION',
      scope: 'COMPANY',
      target: '20000',
      baseline: '30000',
    },
    owner.id,
    'OWNER',
  );
  assert.equal((await goals.get(reduction.id, owner.id, 'OWNER')).progress.percent, 150);
  const analyzed = await analytics.analytics({ page: 1, ...c });
  assert.equal(analyzed.indicators.find((i) => i.code === 'RECEIVED_INCOME').value, '30003');
  assert.ok(analyzed.comparison.length > 0);
  assert.equal(analyzed.timeToFirstContact.samples, '1');
  assert.equal((await analytics.team({ page: 1, ...c }, admin.id, 'ADMIN')).people.length, 1);
  const rls = await control.query('SELECT datname FROM pg_database WHERE datname=$1', [name]);
  assert.equal(rls.rowCount, 1);
  console.log(
    'APROVADO Script08: migrations isoladas; eventos históricos distintos; coorte e divisor zero; propostas, clientes, MRR e aditivos por data; caixa/previsto/despesas/investimentos; precisão decimal; metas compartilhadas sem duplicidade; progresso, limites, redução; concorrência, edição, manual auditado, snapshots, cancelamento; OWNER/ADMIN e analytics.',
  );
} finally {
  if (setup) await setup.end().catch(() => {});
  if (db) await db.$disconnect();
  if (created) {
    assert.match(name, /^vympa_script08_test_[a-f0-9]{32}$/);
    await control.query('DROP DATABASE "' + name + '" WITH (FORCE)');
    console.log(
      'Banco descartável removido; nenhuma meta fictícia persistida no banco operacional.',
    );
  }
  await control.end();
}
