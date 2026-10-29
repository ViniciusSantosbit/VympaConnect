import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
export async function runFinanceAudit({
  db,
  call,
  actor,
  page,
  context,
  origin,
  passed,
  renewCsrf,
}) {
  const day = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
    period = day.slice(0, 7),
    first = period + '-01';
  const catalog = await call('GET', '/finance/catalog');
  assert.equal(catalog.length, 4);
  assert.ok(catalog.every((o) => o.monthlyCents === null && o.baseCents === null));
  const policy = await call('GET', '/finance/discount-policy');
  assert.equal(policy.provisional, true);
  const base = { currentCostCents: 1000000, offeringCodes: ['CUSTOM_AI'], setupCents: 50000 };
  for (const currentCostCents of [0, 100000, 500000, 1000000, 2000000, 123456]) {
    const result = await call('POST', '/finance/simulations/calculate', {
      ...base,
      currentCostCents,
    });
    assert.equal(result.contributionCents, null);
    assert.equal(result.annualSavingsCents, result.savingsCents * 12);
    if (currentCostCents === 1000000)
      assert.deepEqual(
        [result.discountBps, result.monthlyCents, result.savingsCents, result.annualSavingsCents],
        [1400, 860000, 140000, 1680000],
      );
  }
  passed('financeiro: exemplo obrigatório, custos variados, decimais e margem desconhecida reais');
  for (const o of catalog)
    await call(
      'PUT',
      '/finance/catalog/' + o.code,
      {
        name: o.name,
        description: o.description,
        baseCents: 100000,
        setupCents: 50000,
        monthlyCents: 200000,
        operatingCents: 10000,
        active: true,
        version: o.version,
      },
      200,
    );
  await call(
    'PUT',
    '/finance/discount-policy',
    {
      version: policy.version,
      rules: [
        { atCents: 0, discountBps: 1000 },
        { atCents: 1000000, discountBps: 1400 },
      ],
      provisional: true,
    },
    200,
  );
  const high = await call('POST', '/finance/simulations/calculate', {
    ...base,
    infrastructureCents: 900000,
    aiCents: 0,
    maintenanceCents: 0,
    supportCents: 0,
    otherCents: 0,
  });
  assert.equal(high.belowCosts, true);
  const manual = await call('POST', '/finance/simulations/calculate', {
    ...base,
    manualMonthlyCents: 1200000,
    exceptionReason: 'TESTE exceção local',
  });
  assert.equal(manual.savingsCents, -200000);
  const bundle = await call('POST', '/finance/simulations/calculate', {
    ...base,
    offeringCodes: ['CUSTOM_AI', 'AI_INTEGRATION'],
  });
  assert.equal(bundle.overlap, true);
  assert.equal(bundle.catalogueTotalCents, null);
  passed(
    'financeiro: catálogo editável, política auditada, custos superiores e serviços sobrepostos',
  );
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'ADMIN' } });
  await call(
    'POST',
    '/finance/simulations/calculate',
    { ...base, manualMonthlyCents: 500000, exceptionReason: 'TESTE não autorizado' },
    403,
  );
  for (const path of [
    'summary',
    'transactions',
    'categories',
    'investments',
    'recurring',
    'ai-costs',
    'audit',
    'opening-balance',
  ])
    await call('GET', '/finance/management/' + path, undefined, 403);
  await call(
    'PUT',
    '/finance/catalog/CUSTOM_AI',
    { ...catalog.find((o) => o.code === 'CUSTOM_AI'), version: 2 },
    403,
  );
  await call(
    'POST',
    '/finance/management/transactions',
    {
      requestKey: randomUUID(),
      description: 'TESTE acesso proibido',
      type: 'INCOME',
      amountCents: 1,
      competenceOn: day,
      status: 'PENDING',
      categoryId: actor.id,
    },
    403,
  );
  assert.equal((await call('GET', '/dashboard/summary')).metrics.monthlyRevenue, null);
  const lead = await db.lead.findFirst({
    where: { companyName: { startsWith: 'TESTE QA SCRIPT05' } },
  });
  const proposalInput = {
    ...base,
    companyName: 'TESTE proposta financeira',
    segment: 'ADVOCACIA',
    responsibleId: actor.id,
    simulationDate: day,
    leadId: lead.id,
  };
  const proposal = await call('POST', '/finance/simulations', proposalInput);
  const entriesBefore = await db.financialTransaction.count();
  let v = proposal;
  for (const status of ['PREPARED', 'SENT', 'ACCEPTED'])
    v = await call('POST', '/finance/simulations/' + v.id + '/status', {
      version: v.version,
      status,
    });
  assert.equal(await db.financialTransaction.count(), entriesBefore);
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).status, 'NEGOTIATING');
  await call('PUT', '/finance/simulations/' + v.id, { ...proposalInput, version: v.version }, 400);
  const duplicate = await call('POST', '/finance/simulations/' + v.id + '/duplicate');
  assert.equal(duplicate.status, 'DRAFT');
  passed(
    'financeiro: ADMIN simula sem acessar caixa; proposta aceita não vira receita ou contrato',
  );
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'OWNER' } });
  const nowCatalog = await call('GET', '/finance/catalog');
  const custom = nowCatalog.find((o) => o.code === 'CUSTOM_AI');
  await call(
    'PUT',
    '/finance/catalog/CUSTOM_AI',
    {
      name: custom.name,
      description: custom.description,
      active: true,
      monthlyCents: 300000,
      version: custom.version,
    },
    200,
  );
  const saved = await call('GET', '/finance/simulations/' + proposal.id);
  assert.equal(saved.result.monthlyCents, 860000);
  assert.equal(
    saved.result.offeringSnapshots.find((o) => o.code === 'CUSTOM_AI').monthlyCents,
    200000,
  );
  assert.equal(saved.versions.length, 4);
  passed('financeiro: snapshots e versões históricas não mudam quando preços mudam');
  const cats = await call('GET', '/finance/management/categories');
  const general = cats.find((c) => c.name === 'Receitas de serviços'),
    infra = cats.find((c) => c.group === 'INFRA'),
    ai = cats.find((c) => c.group === 'AI'),
    inv = cats.find((c) => c.group === 'INVESTMENT');
  await call(
    'PUT',
    '/finance/management/opening-balance',
    { amountCents: 10000, effectiveOn: first, version: 0 },
    200,
  );
  const entry = (type, amountCents, status, categoryId) => ({
    requestKey: randomUUID(),
    description: 'TESTE financeiro ' + type + ' ' + status,
    type,
    amountCents,
    status,
    categoryId,
    competenceOn: day,
    ...(status === 'SETTLED' ? { settledOn: day } : { dueOn: day }),
  });
  const pendingIncome = entry('INCOME', 10000, 'PENDING', general.id);
  await Promise.all([
    call('POST', '/finance/management/transactions', pendingIncome),
    call('POST', '/finance/management/transactions', pendingIncome),
  ]);
  assert.equal(
    await db.financialTransaction.count({ where: { requestKey: pendingIncome.requestKey } }),
    1,
  );
  await call(
    'POST',
    '/finance/management/transactions',
    { ...pendingIncome, amountCents: 11000 },
    409,
  );
  await call(
    'POST',
    '/finance/management/transactions',
    entry('INCOME', 20000, 'SETTLED', general.id),
  );
  await call(
    'POST',
    '/finance/management/transactions',
    entry('EXPENSE', 3000, 'PENDING', infra.id),
  );
  const paidInput = entry('EXPENSE', 5000, 'SETTLED', infra.id);
  const paid = await call('POST', '/finance/management/transactions', paidInput);
  let summary = await call('GET', '/finance/management/summary?period=' + period);
  assert.deepEqual(
    [summary.receivedCents, summary.paidCents, summary.balanceCents, summary.forecastCents],
    [20000, 5000, 25000, 32000],
  );
  passed('financeiro: saldo inicial, recebido/pago versus pendente e idempotência concorrente');
  await call(
    'PUT',
    '/finance/management/transactions/' + paid.id,
    { ...paidInput, status: 'CANCELLED', settledOn: null, version: paid.version },
    200,
  );
  summary = await call('GET', '/finance/management/summary?period=' + period);
  assert.equal(summary.balanceCents, 30000);
  assert.equal(summary.paidCents, 0);
  assert.equal(
    (await db.financialTransaction.findUnique({ where: { id: paid.id } })).status,
    'CANCELLED',
  );
  await call(
    'PUT',
    '/finance/management/transactions/' + paid.id,
    { ...paidInput, status: 'PENDING', settledOn: null, version: 2 },
    409,
  );
  passed('financeiro: cancelamento auditável restaura caixa e mantém histórico');
  const planned = await call('POST', '/finance/management/investments', {
    name: 'TESTE investimento',
    estimatedCents: 20000,
    priority: 'HIGH',
    status: 'PLANNED',
    plannedOn: day,
    categoryId: inv.id,
    responsibleId: actor.id,
    version: 0,
  });
  assert.equal(
    (await call('GET', '/finance/management/summary?period=' + period)).balanceCents,
    30000,
  );
  const pay = {
    requestKey: randomUUID(),
    amountCents: 15000,
    settledOn: day,
    version: planned.version,
  };
  const payments = await Promise.all([
    call('POST', '/finance/management/investments/' + planned.id + '/pay', pay),
    call('POST', '/finance/management/investments/' + planned.id + '/pay', pay),
  ]);
  assert.equal(payments[0].transactionId, payments[1].transactionId);
  summary = await call('GET', '/finance/management/summary?period=' + period);
  assert.equal(summary.investmentCents, 15000);
  assert.equal(summary.balanceCents, 15000);
  passed(
    'financeiro: investimento planejado não afeta caixa; pagamento concorrente cria uma despesa',
  );
  const recurring = await call('POST', '/finance/management/recurring', {
    description: 'TESTE recorrência mensal',
    amountCents: 1000,
    categoryId: infra.id,
    dueDay: 31,
    startsOn: first,
    active: true,
    version: 0,
  });
  const occurrences = await Promise.all([
    call('POST', '/finance/management/recurring/' + recurring.id + '/generate', { period }),
    call('POST', '/finance/management/recurring/' + recurring.id + '/generate', { period }),
  ]);
  assert.equal(occurrences[0].id, occurrences[1].id);
  assert.equal(occurrences[0].status, 'PENDING');
  assert.equal(
    (await call('GET', '/finance/management/summary?period=' + period)).balanceCents,
    15000,
  );
  passed('financeiro: recorrência mensal gera uma única pendência sem pagamento automático');
  const aiInput = {
    provider: 'TESTE provedor',
    modelService: 'TESTE modelo',
    amountCents: 3000,
    period,
    quantity: '10.5',
    unit: 'unidades',
    version: 0,
  };
  const tracked = await call('POST', '/finance/management/ai-costs', aiInput);
  assert.equal((await call('GET', '/finance/management/summary?period=' + period)).aiCents, 0);
  const aiEntry = await call(
    'POST',
    '/finance/management/transactions',
    entry('EXPENSE', 3000, 'SETTLED', ai.id),
  );
  await call(
    'PUT',
    '/finance/management/ai-costs/' + tracked.id,
    { ...aiInput, version: tracked.version, transactionId: aiEntry.id },
    200,
  );
  await call(
    'POST',
    '/finance/management/ai-costs',
    { ...aiInput, transactionId: aiEntry.id },
    409,
  );
  summary = await call('GET', '/finance/management/summary?period=' + period);
  assert.equal(summary.aiCents, 3000);
  assert.equal(summary.balanceCents, 12000);
  passed('financeiro: custos de IA vinculados são contabilizados uma única vez');
  const previous = new Date(first + 'T00:00:00Z');
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const competenceOn = previous.toISOString().slice(0, 10);
  await call('POST', '/finance/management/transactions', {
    ...entry('INCOME', 1000, 'SETTLED', general.id),
    competenceOn,
  });
  const cash = await call(
      'GET',
      '/finance/management/transactions?period=' + period + '&basis=CASH',
    ),
    accrual = await call(
      'GET',
      '/finance/management/transactions?period=' + period + '&basis=ACCRUAL',
    );
  assert.ok(cash.items.some((e) => e.competenceOn.slice(0, 10) === competenceOn));
  assert.ok(!accrual.items.some((e) => e.competenceOn.slice(0, 10) === competenceOn));
  assert.equal(
    (await call('GET', '/finance/management/summary?period=' + previous.toISOString().slice(0, 7)))
      .receivedCents,
    0,
  );
  assert.equal((await call('GET', '/dashboard/summary')).metrics.monthlyRevenue, 210);
  passed('financeiro: competência, caixa, alteração de período e dashboard conciliados');
  assert.ok((await call('GET', '/finance/management/audit')).length > 10);
  await mkdir(new URL('../../../test-results/', import.meta.url), { recursive: true });
  await page.goto(origin + '/finance');
  for (const [width, height] of [
    [1440, 1000],
    [1366, 768],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const screen of ['home', 'simulator', 'management']) {
      if (screen === 'simulator')
        await page.getByRole('link', { name: /Simulador de Propostas e Planos/ }).click();
      if (screen === 'management')
        await page.getByRole('link', { name: 'Acompanhar o caixa' }).click();
      await page
        .getByRole('heading', {
          level: 1,
          name:
            screen === 'home'
              ? 'Financeiro'
              : screen === 'simulator'
                ? 'Simulador de Propostas e Planos'
                : 'Gestão Financeira da VYMPA',
          exact: true,
        })
        .waitFor();
      const layoutOk = await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      );
      if (!layoutOk) {
        await page.screenshot({
          path: new URL(
            '../../../test-results/finance-overflow.png',
            import.meta.url,
          ).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
        });
        console.log(
          JSON.stringify(
            await page.evaluate(() => ({
              width: innerWidth,
              scroll: document.documentElement.scrollWidth,
              elements: [...document.querySelectorAll('main *')]
                .map((e) => ({
                  tag: e.tagName,
                  cls: e.className,
                  right: e.getBoundingClientRect().right,
                  width: e.getBoundingClientRect().width,
                }))
                .filter((e) => e.right > innerWidth + 1)
                .slice(0, 12),
            })),
          ),
        );
      }
      assert.ok(layoutOk, 'layout sem overflow ' + width + ' ' + screen);
      if (screen !== 'home') {
        await page
          .getByRole('navigation', { name: 'Navegação financeira' })
          .getByRole('link', { name: 'Financeiro', exact: true })
          .click();
        await page.getByRole('heading', { level: 1, name: 'Financeiro', exact: true }).waitFor();
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('heading', { level: 1, name: 'Financeiro', exact: true }).waitFor();
  await page.screenshot({
    path: new URL('../../../test-results/finance-home-real.png', import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1',
    ),
  });
  await page.getByRole('link', { name: /Simulador de Propostas e Planos/ }).click();
  await page.getByLabel('Custo mensal atual total (R$)', { exact: true }).fill('10000,00');
  assert.ok(
    await page
      .locator('.finance-metric')
      .filter({ hasText: 'Proposta VYMPA / mês' })
      .innerText()
      .then((t) => t.includes('8.600,00')),
  );
  await page.screenshot({
    path: new URL(
      '../../../test-results/finance-simulator-real.png',
      import.meta.url,
    ).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  });
  const cashBeforeUi = await db.financialTransaction.count();
  await page
    .getByLabel('Empresa prospectada', { exact: true })
    .fill('TESTE proposta criada pelo React');
  await page.getByLabel('Responsável', { exact: true }).selectOption(actor.id);
  await page.getByRole('checkbox', { name: /Sistema personalizado \+ IA/ }).check();
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await page
    .getByRole('heading', {
      name: 'Proposta salva · TESTE proposta criada pelo React',
      exact: true,
    })
    .waitFor();
  assert.equal(
    await db.proposal.count({ where: { companyName: 'TESTE proposta criada pelo React' } }),
    1,
  );
  assert.equal(await db.financialTransaction.count(), cashBeforeUi);
  passed('financeiro: rascunho salvo pelo React real sem criar receita');
  await page
    .getByRole('navigation', { name: 'Navegação financeira' })
    .getByRole('link', { name: 'Gestão financeira', exact: true })
    .click();
  await page.getByRole('button', { name: 'Nova receita' }).waitFor();
  await page.screenshot({
    path: new URL(
      '../../../test-results/finance-management-real.png',
      import.meta.url,
    ).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  });
  await page.getByRole('button', { name: 'Nova receita', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('TESTE receita pendente pelo React');
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('100,00');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption(general.id);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    (
      await db.financialTransaction.findFirst({
        where: { description: 'TESTE receita pendente pelo React' },
      })
    ).status,
    'PENDING',
  );
  await renewCsrf();
  assert.equal(
    (await call('GET', '/finance/management/summary?period=' + period)).balanceCents,
    13000,
  );
  passed('financeiro: lançamento pendente criado pelo React real sem alterar caixa realizado');
  passed('financeiro: três páginas React reais em desktop, notebook, tablet e celular');
  const tokens = await context.cookies();
  assert.ok(tokens.find((c) => c.name === 'vympa_session' && c.httpOnly));
}
