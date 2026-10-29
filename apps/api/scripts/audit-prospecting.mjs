import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomBytes, createHmac } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { Test } from '@nestjs/testing';
import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
import { requireAuthSettings } from '../src/modules/auth/auth-config.ts';

// Real local services; all business fixtures live in a disposable database.
process.env.VYMPA_DATABASE_TARGET = 'local';
loadDatabaseEnvironment();
process.env.LOG_LEVEL = 'silent';
const settings = requireAuthSettings();
const original = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(original.hostname));
assert.equal(original.pathname, '/vympa_connect');
assert.equal(settings.mode, 'local');
assert.equal(settings.url, 'http://127.0.0.1:54321');
const run = randomBytes(6).toString('hex');
const database = 'vympa_qa_script05_' + run;
assert.match(database, /^vympa_qa_script05_[a-f0-9]{12}$/);
const isolated = new URL(original);
isolated.pathname = '/' + database;
const adminDb = new Client(databaseOptions(original.toString()));
const db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(isolated.toString())) });
const authOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const authAdmin = createClient(settings.url, settings.secretKey, authOptions);
const email = 'qa-script05-' + run + '@example.invalid';
const password = randomBytes(36).toString('base64url');
let identityId,
  created = false,
  browser,
  context,
  app,
  port;
let csrf;
let checks = 0;
let providerCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  if (
    new URL(input instanceof Request ? input.url : String(input)).hostname === 'api.geoapify.com'
  ) {
    if (!process.argv.includes('--real-geoapify') || providerCalls >= 3)
      throw new Error('Orçamento de consultas reais encerrado.');
    providerCalls++;
    console.log('Consulta Geoapify real: ' + providerCalls + '/3');
  }
  return originalFetch(input, options);
};
const passed = (label) => {
  checks++;
  console.log('APROVADO: ' + label);
};
const { AppModule } = await import('../dist/app.module.js');
const { DatabaseService } = await import('../dist/database/database.service.js');
const { configureApp } = await import('../dist/config/configure-app.js');
async function startApi() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(db)
    .compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  port = app.getHttpServer().address().port;
}
async function call(
  method,
  path,
  data,
  status = method === 'GET' || method === 'PATCH' ? 200 : 201,
) {
  const response = await context.request.fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method,
    data,
    headers: { Origin: settings.origin, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) },
  });
  assert.equal(
    response.status(),
    status,
    method + ' ' + path + ' (HTTP ' + response.status() + ')',
  );
  return response.json();
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, ''))
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((v) => parseInt(v, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
try {
  await adminDb.connect();
  await adminDb.query(`CREATE DATABASE "${database}"`);
  created = true;
  const migrate = new Client(databaseOptions(isolated.toString()));
  await migrate.connect();
  try {
    for (const name of (await readdir(new URL('../prisma/migrations/', import.meta.url))).sort()) {
      if (/^\d+_/.test(name))
        await migrate.query(
          await readFile(
            new URL('../prisma/migrations/' + name + '/migration.sql', import.meta.url),
            'utf8',
          ),
        );
    }
  } finally {
    await migrate.end();
  }
  await db.$connect();
  passed('migrations completas em PostgreSQL isolado');
  const user = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(user.error, null, 'criar identidade temporária local');
  identityId = user.data.user.id;
  const actor = await db.adminProfile.create({ data: { identityId, email, role: 'OWNER' } });
  await startApi();
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await call('GET', '/prospecting/leads', undefined, 401);
  csrf = (await call('GET', '/auth/csrf')).csrfToken;
  csrf = (await call('POST', '/auth/login', { email, password })).csrfToken;
  await call('GET', '/prospecting/leads', undefined, 403);
  const sdk = createClient(settings.url, settings.publicKey, authOptions);
  assert.equal((await sdk.auth.signInWithPassword({ email, password })).error, null);
  const factor = await sdk.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'QA temporário ' + run,
  });
  assert.equal(factor.error, null, 'cadastro TOTP real');
  await call('POST', '/auth/mfa/verify', {
    factorId: factor.data.id,
    code: totp(factor.data.totp.secret),
  });
  assert.equal((await call('GET', '/auth/session')).state, 'ready');
  passed('login e MFA reais no Supabase local; sessão ausente e MFA incompleto bloqueados');
  const cookies = await context.cookies();
  assert.ok(
    cookies.find((c) => c.name === 'vympa_session' && c.httpOnly && c.sameSite === 'Strict'),
  );
  const forbidden = await context.request.post(
    `http://127.0.0.1:${port}/api/v1/prospecting/leads`,
    { data: {}, headers: { Origin: settings.origin } },
  );
  assert.equal(forbidden.status(), 403);
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'ADMIN' } });
  await call('GET', '/admin/users', undefined, 403);
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'OWNER' } });
  passed('cookies HttpOnly/SameSite, CSRF e RBAC reais');
  const name = 'TESTE QA SCRIPT05 ' + run;
  const lead = await call('POST', '/prospecting/leads', {
    companyName: name,
    segment: 'ADVOCACIA',
    region: 'Centro-Oeste',
    state: 'DF',
    city: 'Brasília',
    assigneeId: actor.id,
  });
  assert.ok(await db.lead.findUnique({ where: { id: lead.id } }));
  assert.equal((await call('GET', '/prospecting/leads/' + lead.id)).companyName, name);
  const page = await context.newPage();
  // Transport proxy only: requests reach the real isolated API with actual session cookies.
  await page.route('**/api/v1/**', async (route) => {
    const target = new URL(route.request().url());
    target.port = String(port);
    await route.fulfill({ response: await route.fetch({ url: target.href }) });
  });
  await page.goto(settings.origin + '/crm');
  await page.getByRole('button', { name: name + ' Advocacia', exact: true }).waitFor();
  await page.reload();
  await page.getByText(name, { exact: true }).waitFor();
  await app.close();
  app = null;
  await startApi();
  await page.reload();
  await page.getByText(name, { exact: true }).waitFor();
  assert.equal((await call('GET', '/prospecting/leads/' + lead.id)).companyName, name);
  passed('persistência SQL + API + recarga React + reinicialização da API isolada');
  csrf = (await call('GET', '/auth/csrf')).csrfToken;
  const external = 'geoapify_' + run;
  const concurrent = await Promise.all(
    [0, 1].map(() =>
      context.request.post(`http://127.0.0.1:${port}/api/v1/prospecting/leads`, {
        headers: { Origin: settings.origin, 'X-CSRF-Token': csrf },
        data: { placeId: external, segment: 'ADVOCACIA' },
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [201, 409]);
  assert.equal(await db.placeReference.count({ where: { placeId: external } }), 1);
  await call('POST', '/prospecting/leads', { placeId: run, segment: 'CONTABILIDADE' });
  passed('duplicidade concorrente: uma criação e um conflito; provedores com IDs separados');
  await call('PATCH', '/prospecting/leads/' + lead.id + '/status', { status: 'CONTACTED' });
  await call('POST', '/prospecting/leads/' + lead.id + '/notes', { body: 'TESTE nota isolada' });
  await call('POST', '/prospecting/leads/' + lead.id + '/interactions', {
    channel: 'PHONE',
    body: 'TESTE interação isolada',
  });
  await call('POST', '/prospecting/leads/' + lead.id + '/follow-ups', {
    action: 'TESTE acompanhamento',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await call('PATCH', '/prospecting/leads/' + lead.id + '/status', { status: 'NEGOTIATING' });
  const saved = await call('GET', '/prospecting/leads/' + lead.id);
  assert.equal(saved.followUps.length, 1);
  for (const kind of ['NOTE', 'INTERACTION', 'STATUS'])
    assert.ok(saved.events.some((e) => e.kind === kind));
  assert.ok(
    saved.events.some((e) => e.previousStatus === 'CONTACTED' && e.newStatus === 'NEGOTIATING'),
  );
  assert.ok(await db.adminAuditEvent.count({ where: { targetId: lead.id } }));
  const filtered = await call(
    'GET',
    '/prospecting/leads?' +
      new URLSearchParams({
        region: 'Centro-Oeste',
        state: 'DF',
        city: 'Brasília',
        segment: 'ADVOCACIA',
        status: 'NEGOTIATING',
        assigneeId: actor.id,
      }),
  );
  assert.equal(filtered.total, 1);
  assert.equal((await call('GET', '/prospecting/leads?status=WON')).total, 0);
  assert.ok((await call('GET', '/dashboard/summary')).prospecting.negotiating >= 1);
  await page.reload();
  await page
    .locator('.kanban-column.status-NEGOTIATING')
    .getByText(name, { exact: true })
    .waitFor();
  passed(
    'responsável, filtros, notas, interação, acompanhamento, histórico, Kanban e dashboard reais',
  );
  csrf = (await call('GET', '/auth/csrf')).csrfToken;
  if (process.argv.includes('--real-geoapify')) {
    const bounds = { west: -47.95, south: -15.85, east: -47.85, north: -15.75 };
    const results = [];
    for (const segment of ['ADVOCACIA', 'CONTABILIDADE', 'IMOBILIARIO']) {
      const result = await call('POST', '/prospecting/places/search', { segment, bounds });
      results.push({ segment, results: result.places.length });
    }
    assert.equal((await db.placesUsage.aggregate({ _sum: { calls: true } }))._sum.calls, 3);
    console.log('Geoapify real: ' + JSON.stringify(results));
    passed('exatamente três consultas Geoapify reais com sessão/MFA e limites ativos');
  }
  if (process.argv.includes('--finance')) {
    await (
      await import('./audit-finance-scenarios.mjs')
    ).runFinanceAudit({
      db,
      call,
      actor,
      page,
      context,
      origin: settings.origin,
      passed,
      renewCsrf: async () => {
        csrf = (await call('GET', '/auth/csrf')).csrfToken;
      },
    });
  }
  const reserve = createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const unavailablePort = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const unavailableUrl = new URL(original);
  unavailableUrl.port = String(unavailablePort);
  const unavailableDb = new DatabaseService({ getOrThrow: () => unavailableUrl.toString() });
  try {
    await assert.rejects(() => unavailableDb.onModuleInit());
  } finally {
    await unavailableDb.$disconnect();
  }
  passed('banco indisponível detectado em conexão isolada; PostgreSQL operacional intacto');
  await call('POST', '/auth/logout');
  await call('GET', '/prospecting/leads', undefined, 401);
  passed('logout real revoga sessão');
  console.log(
    JSON.stringify({
      checks,
      database: 'isolado descartável',
      auth: 'Supabase local real',
      browser: 'React real sem fixtures de dados ou sessão',
    }),
  );
} catch (error) {
  console.error(
    'Auditoria isolada falhou: ' +
      (error.message?.split('\n')[0] ?? error.name) +
      '; consultas Geoapify: ' +
      providerCalls,
  );
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close();
  await app?.close();
  await db.$disconnect();
  if (identityId) {
    const current = await authAdmin.auth.admin.getUserById(identityId);
    if (current.data.user?.email === email) {
      const removed = await authAdmin.auth.admin.deleteUser(identityId);
      if (removed.error) {
        console.error('Remoção da identidade temporária não confirmada.');
        process.exitCode = 1;
      }
    }
  }
  if (
    created &&
    /^vympa_qa_script05_[a-f0-9]{12}$/.test(database) &&
    database !== original.pathname.slice(1)
  ) {
    await adminDb.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
      [database],
    );
    await adminDb.query(`DROP DATABASE "${database}"`);
  }
  await adminDb.end();
  console.log('Limpeza concluída: fixtures isoladas removidas; CRM operacional preservado.');
}
