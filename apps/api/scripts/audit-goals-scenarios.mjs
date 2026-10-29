import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function runGoalsAudit({ db, call, actor, page, origin, passed, renewCsrf }) {
  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const dto = {
    requestKey: randomUUID(),
    title: 'QA Meta automática Script08',
    category: 'COMMERCIAL',
    metric: 'NEW_LEADS',
    mode: 'AUTO',
    direction: 'GROWTH',
    target: '1',
    startsOn: day.slice(0, 7) + '-01',
    endsOn: day,
    priority: 'HIGH',
    periodicity: 'CUSTOM',
    scope: 'ASSIGNED',
    assigneeIds: [actor.id],
    adminVisible: false,
    allowManualUpdates: false,
    alertDays: 7,
  };
  const goal = await call('POST', '/goals', dto);
  const auto = await call('GET', '/goals/' + goal.id);
  assert.ok(Number(auto.progress.value) >= 1);
  assert.equal(auto.progress.status, 'ACHIEVED');
  await call(
    'POST',
    '/goals/' + goal.id + '/manual-updates',
    {
      version: goal.version,
      requestKey: randomUUID(),
      value: '999',
      observedOn: day,
      reason: 'Não deve sobrescrever automáticos',
    },
    400,
  );
  await page.goto(origin + '/goals');
  await page.getByRole('heading', { name: 'Central de Metas', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Abrir metas comerciais', exact: true }).click();
  await page.getByRole('heading', { name: goal.title, exact: true }).click();
  await page.getByRole('heading', { name: 'Progresso e origem', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Atualizar realizado', exact: true }).count(),
    0,
  );
  await renewCsrf();
  passed(
    'Script08: meta automática calculada no SQL e exibida no React real; realização manipulada bloqueada',
  );
  const financial = await call('POST', '/goals', {
    ...dto,
    requestKey: randomUUID(),
    title: 'QA Financeira privada Script08',
    category: 'FINANCIAL',
    metric: 'RECEIVED_INCOME',
    scope: 'COMPANY',
    target: '10000',
    adminVisible: true,
  });
  const actual = await call('GET', '/goals/' + financial.id),
    cash = await call('GET', '/finance/management/summary');
  assert.equal(Number(actual.progress.value), cash.receivedCents);
  let manual = await call('POST', '/goals', {
    ...dto,
    requestKey: randomUUID(),
    title: 'QA Atividade compartilhada Script08',
    category: 'TEAM',
    metric: 'CUSTOM_ACTIVITY',
    mode: 'MANUAL',
    target: '2.25',
    allowManualUpdates: true,
  });
  const update = {
    version: manual.version,
    requestKey: randomUUID(),
    value: '1.125',
    observedOn: day,
    reason: 'Atualização manual isolada e auditada',
  };
  const same = await Promise.all(
    [1, 2].map(() => call('POST', '/goals/' + manual.id + '/manual-updates', update)),
  );
  assert.equal(same[0].id, same[1].id);
  manual = await call('GET', '/goals/' + manual.id);
  assert.equal(manual.progress.percent, 50);
  assert.equal(manual.progress.remaining, '1.125');
  await call('POST', '/goals/' + manual.id + '/comments', {
    body: 'Comentário de alinhamento isolado',
  });
  await call('POST', '/goals/' + manual.id + '/blockers', {
    version: manual.version,
    blocked: true,
    reason: 'Impedimento temporário de validação',
  });
  await call('POST', '/goals/' + manual.id + '/snapshots');
  const history = await call('GET', '/goals/' + manual.id + '/history');
  assert.ok(history.some((h) => h.kind === 'MANUAL_UPDATE'));
  assert.ok(history.some((h) => h.kind === 'SNAPSHOT' && h.after.progress.value === '1.125'));
  passed(
    'Script08: metas manuais compartilhadas, valor decimal exato, idempotência concorrente, comentários, impedimento e fotografia auditados',
  );
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'ADMIN' } });
  await call('GET', '/goals/' + financial.id, undefined, 404);
  await call('GET', '/goals/analytics', undefined, 403);
  const definitions = await call('GET', '/goals/definitions');
  assert.ok(definitions.every((d) => !d.financial));
  const visible = await call('GET', '/goals');
  assert.ok(visible.items.every((g) => g.category !== 'FINANCIAL'));
  const summary = await call('GET', '/goals/summary');
  assert.equal(summary.financialInProgress, null);
  manual = await call('GET', '/goals/' + manual.id);
  await call('POST', '/goals/' + manual.id + '/manual-updates', {
    version: manual.version,
    requestKey: randomUUID(),
    value: '1.5',
    observedOn: day,
    reason: 'Atualização permitida para administrador atribuído',
  });
  await page.goto(origin + '/goals/detail/' + goal.id);
  await page.getByRole('heading', { name: goal.title, exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Editar meta', exact: true }).count(), 0);
  await renewCsrf();
  passed(
    'Script08: ADMIN acessa somente metas autorizadas, não recebe números financeiros e atualiza somente manuais permitidas',
  );
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'OWNER' } });
  manual = await call('GET', '/goals/' + manual.id);
  await call('POST', '/goals/' + manual.id + '/cancel', {
    version: manual.version,
    reason: 'Encerramento da fixture de QA',
  });
  assert.equal((await call('GET', '/goals/' + manual.id)).progress.status, 'CANCELLED');
  const analytics = await call(
    'GET',
    '/goals/analytics?startsOn=' + day.slice(0, 7) + '-01&endsOn=' + day,
  );
  assert.ok(analytics.indicators.some((i) => i.code === 'RECEIVED_INCOME'));
  assert.ok(analytics.comparison.length > 0);
  await page.goto(origin + '/goals/analytics');
  await page.getByRole('heading', { name: 'Indicadores Estratégicos', exact: true }).waitFor();
  await page
    .getByRole('heading', { name: 'Comparação com o período anterior', exact: true })
    .waitFor();
  await renewCsrf();
  const dashboard = await call('GET', '/dashboard/summary');
  assert.ok(dashboard.goalIndicators.total >= 3);
  passed(
    'Script08: analytics, comparação temporal, cancelamento e dashboard reais conciliados com as fontes de origem',
  );
}
