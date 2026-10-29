import { test, expect, type Page } from '@playwright/test';
const actor = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222';
async function fixtures(page: Page, role = 'OWNER') {
  const records: Record<string, unknown>[] = [];
  let privateCalls = 0;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { role, email: 'owner@example.invalid', state: 'ready', factors: [] },
      });
    if (path.endsWith('/prospecting/assignees'))
      return route.fulfill({ json: [{ id: actor, email: 'owner@example.invalid' }] });
    if (path.endsWith('/goals/summary'))
      return route.fulfill({
        json: {
          total: records.length,
          active: records.length,
          achieved: 0,
          atRisk: 0,
          overdue: 0,
          expiring: 0,
          financialInProgress: role === 'OWNER' ? 0 : null,
          commercialProgress: null,
          items: [],
        },
      });
    if (path.endsWith('/goals')) {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON(),
          g = {
            ...input,
            id,
            unit: input.category === 'FINANCIAL' ? 'CENTS' : 'COUNT',
            version: 1,
            cancelledAt: null,
            blocked: false,
            baseline: null,
            assignments: [],
            progress: {
              value: '0',
              target: input.target,
              baseline: null,
              unit: 'COUNT',
              percent: 0,
              barPercent: 0,
              remaining: input.target,
              status: 'NOT_STARTED',
              withinLimit: null,
              available: true,
              reason: null,
              source: 'Leads criados no período; autoria do cadastro.',
              updatedAt: new Date().toISOString(),
              cutoff: '2026-10-29',
              phase: 'Alcance da meta',
            },
          };
        records.push(g);
        return route.fulfill({ status: 201, json: g });
      }
      return route.fulfill({
        json: { items: records, total: records.length, page: 1, pageSize: 30 },
      });
    }
    if (path.endsWith('/goals/' + id)) return route.fulfill({ json: records[0] });
    if (path.endsWith('/history')) return route.fulfill({ json: [] });
    if (path.endsWith('/goals/analytics')) {
      privateCalls++;
      return route.fulfill({ status: 403, json: { message: 'Sem acesso' } });
    }
    if (path.endsWith('/goals/team'))
      return route.fulfill({ json: { people: [], source: 'Usuários existentes' } });
    return route.fulfill({ status: 404, json: { message: 'Fixture indisponível' } });
  });
  return { records, privateCalls: () => privateCalls };
}
test('metas: quatro cards, cadastro e progresso automático sem alteração manual', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.goto('/goals');
  await expect(page.getByRole('heading', { name: 'Central de Metas' })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir metas comerciais', exact: true }).click();
  await page.getByRole('button', { name: 'Criar meta', exact: true }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nome', { exact: true }).fill('Prospectar escritórios QA');
  await d.getByLabel('Valor-alvo (quantidade)').fill('100');
  await d.getByRole('button', { name: 'Salvar meta' }).click();
  await page.getByRole('heading', { name: 'Prospectar escritórios QA' }).click();
  await expect(page.getByRole('heading', { name: 'Progresso e origem' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar realizado' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prospectar escritórios QA' })).toBeVisible();
  expect(fixture.records).toHaveLength(1);
  expect(fixture.records[0]?.target).toBe('100');
});
test('ADMIN não navega para metas financeiras nem solicita analytics privados', async ({
  page,
}) => {
  const f = await fixtures(page, 'ADMIN');
  await page.goto('/goals');
  await expect(page.getByRole('heading', { name: 'Central de Metas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir metas financeiras' })).toHaveCount(0);
  await page.goto('/goals/financial');
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/goals/analytics');
  await expect(page).toHaveURL(/dashboard/);
  expect(f.privateCalls()).toBe(0);
});
test('central de metas responsiva em desktop, notebook, tablet e celular', async ({
  page,
}, info) => {
  await fixtures(page);
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/goals');
    await expect(page.getByRole('heading', { name: 'Central de Metas' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.getByRole('heading', { name: 'Central de Metas' }).click();
    await page.screenshot({ path: info.outputPath('goals-' + width + '.png'), fullPage: true });
  }
});
