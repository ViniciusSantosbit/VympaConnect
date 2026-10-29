import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { loadDatabaseEnvironment } from '../src/config/database-environment.ts';
import { ClientsService } from '../dist/modules/clients/clients.service.js';
import { ContractsService } from '../dist/modules/contracts/contracts.service.js';
import { ContractDocumentsService } from '../dist/modules/contracts/contract-documents.service.js';
import { SimulatorService } from '../dist/modules/finance/simulator.service.js';
import { ManagementService } from '../dist/modules/finance/management.service.js';
import { today, validDate, effectiveMonthly } from '../dist/modules/clients/commercial-support.js';
process.env.VYMPA_DATABASE_TARGET = 'local';
loadDatabaseEnvironment();
const base = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
assert.equal(base.port, '5432');
assert.equal(base.pathname, '/vympa_connect');
const name = 'vympa_script07_test_' + randomUUID().replaceAll('-', '');
assert.match(name, /^vympa_script07_test_[a-f0-9]{32}$/);
const control = new pg.Client({ connectionString: base.toString(), connectionTimeoutMillis: 5000 });
let db,
  setup,
  created = false;
function shift(days) {
  const d = validDate(today());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const fails = (fn, status) => assert.rejects(fn, (e) => e.status === status);
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
  const clients = new ClientsService(db),
    contracts = new ContractsService(db, clients),
    docs = new ContractDocumentsService(db, contracts),
    simulator = new SimulatorService(db),
    finance = new ManagementService(db);
  const owner = await db.adminProfile.create({
    data: { identityId: randomUUID(), email: 'owner@example.invalid', role: 'OWNER' },
  });
  const admin = await db.adminProfile.create({
    data: { identityId: randomUUID(), email: 'admin@example.invalid', role: 'ADMIN' },
  });
  const client = await clients.create(
    {
      companyName: 'Empresa isolada',
      segment: 'ADVOCACIA',
      responsibleId: owner.id,
      cnpj: '04.252.011/0001-10',
    },
    owner.id,
    'OWNER',
  );
  assert.equal(client.status, 'PROSPECT');
  await fails(
    () =>
      clients.create(
        {
          companyName: 'Duplicada',
          segment: 'ADVOCACIA',
          responsibleId: owner.id,
          cnpj: '04252011000110',
        },
        owner.id,
        'OWNER',
      ),
    409,
  );
  const sameName = await clients.create(
    { companyName: 'Empresa isolada', segment: 'ADVOCACIA', responsibleId: admin.id },
    admin.id,
    'ADMIN',
  );
  assert.notEqual(client.id, sameName.id);
  await fails(() => clients.get(client.id, admin.id, 'ADMIN'), 403);
  await clients.update(client.id, { version: 1, city: 'Brasília' }, owner.id, 'OWNER');
  await fails(
    () => clients.update(client.id, { version: 1, city: 'Outra' }, owner.id, 'OWNER'),
    409,
  );
  const filtered = await clients.list(
    { page: 1, days: 30, segment: 'ADVOCACIA', query: '04252011000110' },
    owner.id,
    'OWNER',
  );
  assert.equal(filtered.total, 1);
  await clients.contact(client.id, { name: 'Profissional A', primary: true }, owner.id, 'OWNER');
  await clients.contact(client.id, { name: 'Profissional B', primary: true }, owner.id, 'OWNER');
  assert.equal(await db.clientContact.count({ where: { clientId: client.id, primary: true } }), 1);
  await clients.service(
    client.id,
    { version: 2, code: 'CUSTOM_AI', status: 'IMPLEMENTING' },
    owner.id,
    'OWNER',
  );
  const lead = await db.lead.create({
    data: {
      companyName: 'Origem comercial',
      segment: 'ADVOCACIA',
      createdById: owner.id,
      assigneeId: owner.id,
      events: { create: { actorId: owner.id, kind: 'NOTE', body: 'Histórico preservado' } },
    },
  });
  const conversions = await Promise.all(
    [1, 2].map(() => clients.convert(lead.id, { cnpj: '04252011000110' }, owner.id, 'OWNER')),
  );
  assert.equal(conversions[0].id, client.id);
  assert.equal(conversions[1].id, client.id);
  assert.equal(await db.client.count(), 2);
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).clientId, client.id);
  assert.equal(await db.leadEvent.count({ where: { leadId: lead.id, kind: 'NOTE' } }), 1);
  assert.equal(await db.leadEvent.count({ where: { leadId: lead.id, kind: 'CLIENT_LINKED' } }), 1);
  const lead2 = await db.lead.create({
    data: { companyName: 'Nova empresa', segment: 'CONTABILIDADE', createdById: owner.id },
  });
  const converted = await Promise.all(
    [1, 2].map(() => clients.convert(lead2.id, {}, owner.id, 'OWNER')),
  );
  assert.equal(converted[0].id, converted[1].id);
  assert.equal(await db.client.count(), 3);
  const offering = await db.serviceOffering.findUnique({ where: { code: 'CUSTOM_AI' } });
  await simulator.saveOffering(
    'CUSTOM_AI',
    {
      version: offering.version,
      name: offering.name,
      description: offering.description,
      active: true,
      monthlyCents: 10001,
    },
    owner.id,
  );
  let proposal = await simulator.save(
    {
      companyName: client.companyName,
      segment: 'ADVOCACIA',
      leadId: lead.id,
      responsibleId: owner.id,
      currentCostCents: 12000,
      manualMonthlyCents: 10001,
      exceptionReason: 'Negociação isolada',
      setupCents: 5500,
      offeringCodes: ['CUSTOM_AI'],
      simulationDate: today(),
    },
    owner.id,
    'OWNER',
  );
  for (const status of ['PREPARED', 'SENT', 'ACCEPTED'])
    proposal = await simulator.state(proposal.id, { version: proposal.version, status }, owner.id);
  const dto = {
    requestKey: randomUUID(),
    number: 'TEST-001',
    clientId: client.id,
    title: 'Contrato de teste',
    responsibleId: owner.id,
    startsOn: shift(-5),
    endsOn: shift(20),
    serviceCodes: [],
    billingPeriod: 'MONTHLY',
    proposalId: proposal.id,
  };
  const creations = await Promise.all([1, 2].map(() => contracts.create(dto, owner.id, 'OWNER')));
  assert.equal(creations[0].id, creations[1].id);
  assert.equal(await db.contract.count(), 1);
  let c = await contracts.get(creations[0].id, owner.id, 'OWNER');
  assert.equal(c.monthlyCents, 10001);
  assert.equal(c.proposalSnapshot.version, proposal.version);
  assert.equal(c.status, 'DRAFT');
  assert.equal(await db.financialTransaction.count(), 0);
  await fails(
    () =>
      contracts.state(
        c.id,
        { version: c.version, status: 'ACTIVE', reason: 'Ativação indevida' },
        owner.id,
        'OWNER',
      ),
    400,
  );
  c = await contracts.state(
    c.id,
    { version: c.version, status: 'PENDING_SIGNATURE', reason: 'Revisão concluída' },
    owner.id,
    'OWNER',
  );
  await fails(
    () =>
      contracts.state(
        c.id,
        { version: c.version, status: 'SIGNED', reason: 'Sem evidência' },
        owner.id,
        'OWNER',
      ),
    400,
  );
  c = await contracts.state(
    c.id,
    {
      version: c.version,
      status: 'SIGNED',
      reason: 'Conferência administrativa',
      signatureEvidence: 'Confirmação administrativa isolada de teste; sem assinatura eletrônica.',
    },
    owner.id,
    'OWNER',
  );
  c = await contracts.state(
    c.id,
    { version: c.version, status: 'ACTIVE', reason: 'Início da execução' },
    owner.id,
    'OWNER',
  );
  assert.equal(await db.financialTransaction.count(), 0);
  assert.equal((await db.client.findUnique({ where: { id: client.id } })).status, 'PROSPECT');
  await fails(
    () =>
      contracts.amend(
        c.id,
        {
          version: c.version,
          requestKey: randomUUID(),
          monthlyCents: 11001,
          effectiveOn: shift(-1),
          reason: 'Reajuste retroativo',
        },
        owner.id,
        'OWNER',
      ),
    400,
  );
  const amend = {
    version: c.version,
    requestKey: randomUUID(),
    monthlyCents: 11001,
    effectiveOn: shift(1),
    reason: 'Reajuste acordado',
  };
  const changes = await Promise.all(
    [1, 2].map(() => contracts.amend(c.id, amend, owner.id, 'OWNER')),
  );
  assert.equal(changes[0].id, changes[1].id);
  assert.equal(await db.contractAmendment.count(), 1);
  const raw = await db.contract.findUnique({ where: { id: c.id }, include: { amendments: true } });
  assert.equal(raw.monthlyCents, 10001);
  assert.equal(effectiveMonthly(raw, today()), 10001);
  assert.equal(effectiveMonthly(raw, shift(1)), 11001);
  c = await contracts.get(c.id, owner.id, 'OWNER');
  const renewalDto = {
    version: c.version,
    requestKey: randomUUID(),
    number: 'TEST-002',
    startsOn: shift(21),
    endsOn: shift(365),
    reason: 'Renovação administrativa',
  };
  const renewal = await contracts.renew(c.id, renewalDto, owner.id, 'OWNER');
  assert.equal(renewal.status, 'DRAFT');
  assert.equal((await contracts.renew(c.id, renewalDto, owner.id, 'OWNER')).id, renewal.id);
  const meta = await docs.metadata(
    c.id,
    { name: 'Contrato de teste.pdf', kind: 'PDF' },
    owner.id,
    'OWNER',
  );
  assert.equal(meta.storageStatus, 'PENDING_PRIVATE_STORAGE');
  await fails(() => docs.blocked(c.id, owner.id, 'OWNER'), 503);
  await fails(() => docs.list(c.id, admin.id, 'ADMIN'), 403);
  await db.client.update({ where: { id: client.id }, data: { responsibleId: admin.id } });
  const visible = await contracts.get(c.id, admin.id, 'ADMIN');
  assert.ok(!('monthlyCents' in visible));
  assert.ok(!('proposalSnapshot' in visible));
  assert.ok(visible.history.every((h) => !('after' in h) && !('reason' in h)));
  await fails(
    () => contracts.update(c.id, { version: raw.version + 1, monthlyCents: 1 }, admin.id, 'ADMIN'),
    400,
  );
  const summary = await contracts.summary(owner.id, 'OWNER');
  assert.equal(summary.active, 1);
  assert.equal(summary.expiring, 1);
  assert.equal(summary.monthlyContractedCents, '10001');
  await db.contract.update({ where: { id: c.id }, data: { billingPeriod: 'YEARLY' } });
  assert.equal((await contracts.summary(owner.id, 'OWNER')).monthlyContractedCents, '10001');
  await db.contract.update({ where: { id: c.id }, data: { billingPeriod: 'MONTHLY' } });
  assert.equal((await contracts.expiring({ page: 1, days: 30 }, owner.id, 'OWNER')).length, 1);
  const cat = await db.financialCategory.findFirst({ where: { name: 'Receitas de serviços' } });
  const entry = {
    requestKey: randomUUID(),
    description: 'Cobrança prevista isolada',
    type: 'INCOME',
    amountCents: 10001,
    competenceOn: today(),
    dueOn: today(),
    status: 'PENDING',
    categoryId: cat.id,
    clientId: client.id,
    contractId: c.id,
    billingReference: 'TEST-001/' + today().slice(0, 7),
  };
  const entries = await Promise.all([1, 2].map(() => finance.saveEntry(entry, owner.id)));
  assert.equal(entries[0].id, entries[1].id);
  assert.equal(await db.financialTransaction.count(), 1);
  assert.equal((await finance.summary()).receivedCents, 0);
  assert.equal((await finance.summary()).pendingIncomeCents, 10001);
  await assert.rejects(
    () => finance.saveEntry({ ...entry, requestKey: randomUUID() }, owner.id),
    (e) => e.code === 'P2002',
  );
  assert.equal(await db.financialTransaction.count(), 1);
  await finance.saveEntry(
    { ...entry, version: entries[0].version, status: 'SETTLED', settledOn: today() },
    owner.id,
    entries[0].id,
  );
  assert.equal((await finance.summary()).receivedCents, 10001);
  assert.ok(
    (await clients.activity(client.id, owner.id, 'OWNER', { page: 1, days: 30 })).length > 0,
  );
  assert.ok((await db.contractStatusHistory.count()) > 5);
  const rules = await control.query('SELECT datname FROM pg_database WHERE datname=$1', [name]);
  assert.equal(rules.rowCount, 1);
  console.log(
    'APROVADO: migrations em banco isolado; clientes, CNPJ, filtros, contatos, responsáveis, histórico, conversões concorrentes, propostas, contratos, assinatura, vigências, reajustes, renovação, documentos, ADMIN/OWNER, previsões e pagamentos exatos, duplicidade e auditoria.',
  );
} finally {
  if (setup) await setup.end().catch(() => {});
  if (db) await db.$disconnect();
  if (created) {
    assert.match(name, /^vympa_script07_test_[a-f0-9]{32}$/);
    await control.query('DROP DATABASE "' + name + '" WITH (FORCE)');
    console.log('Banco isolado de testes removido; banco operacional preservado.');
  }
  await control.end();
}
