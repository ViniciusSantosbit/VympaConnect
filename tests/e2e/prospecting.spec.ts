import { test, expect } from '@playwright/test';
// Transporte simulado exclusivamente neste teste. Nenhum dado operacional é criado.
test('CRM: cadastro, Kanban, persistência por recarga e layout sem chave Geoapify', async ({
  page,
}, testInfo) => {
  let status = 'NOT_CONTACTED';
  let created = false;
  const notes: {
    id: string;
    kind: string;
    body: string;
    createdAt: string;
    actor: { email: string };
    channel: null;
    newStatus: null;
    previousStatus: null;
  }[] = [];
  const actor = '11111111-1111-4111-8111-111111111111';
  const id = '22222222-2222-4222-8222-222222222222';
  const lead = () => ({
    id,
    companyName: 'Fixture CRM isolada',
    segment: 'ADVOCACIA',
    status,
    region: null,
    state: null,
    city: null,
    email: null,
    contactName: null,
    contactChannel: null,
    assigneeId: actor,
    assignee: { id: actor, email: 'fixture@example.invalid' },
    externalReference: null,
    lossReason: null,
    lastContactAt: null,
    nextAction: null,
    createdAt: '2026-10-28T12:00:00Z',
    updatedAt: new Date().toISOString(),
    events: notes,
    followUps: [],
  });
  const googleRequests: string[] = [];
  page.on('request', (request) => {
    if (/maps.googleapis.com|places.googleapis.com/.test(request.url()))
      googleRequests.push(request.url());
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { email: 'fixture@example.invalid', role: 'ADMIN', state: 'ready', factors: [] },
      });
    if (path.endsWith('/prospecting/usage'))
      return route.fulfill({
        json: { configured: false, hour: 0, day: 0, details: 0, hourLimit: 20, dayLimit: 100 },
      });
    if (path.endsWith('/assignees'))
      return route.fulfill({ json: [{ id: actor, email: 'fixture@example.invalid' }] });
    if (path.endsWith('/leads') && route.request().method() === 'GET')
      return route.fulfill({
        json: { items: created ? [lead()] : [], total: created ? 1 : 0, pageSize: 30 },
      });
    if (path.endsWith('/leads') && route.request().method() === 'POST') {
      created = true;
      expect(route.request().postDataJSON()).not.toHaveProperty('userId');
      return route.fulfill({ json: lead() });
    }
    if (path.endsWith('/status')) {
      status = route.request().postDataJSON().status;
      return route.fulfill({ json: lead() });
    }
    if (path.endsWith('/notes')) {
      notes.push({
        id: 'test-note',
        kind: 'NOTE',
        body: route.request().postDataJSON().body,
        createdAt: new Date().toISOString(),
        actor: { email: 'fixture@example.invalid' },
        channel: null,
        newStatus: null,
        previousStatus: null,
      });
      return route.fulfill({ json: lead() });
    }
    if (path.endsWith('/leads/' + id)) return route.fulfill({ json: lead() });
    return route.fulfill({ status: 404, json: { message: 'Fixture route missing' } });
  });
  await page.goto('/crm');
  await expect(page.getByText('Nenhum lead cadastrado')).toBeVisible();
  const filterToggle = page.getByRole('button', { name: 'Filtros', exact: true });
  if (await filterToggle.isVisible()) await filterToggle.click();
  await expect(page.getByRole('button', { name: 'Buscar no Geoapify' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explorar mapa', exact: true })).toHaveCount(0);
  if (await filterToggle.isVisible()) await filterToggle.click();
  await page.getByRole('button', { name: 'Novo lead' }).click();
  await page.getByLabel('Nome da empresa').fill('Fixture CRM isolada');
  await page.getByRole('button', { name: 'Cadastrar lead' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture CRM isolada' })).toBeVisible();
  await page.getByLabel('Nova observação').fill('Nota de teste isolada');
  await page.getByRole('button', { name: 'Registrar nota', exact: true }).click();
  await expect(page.getByText('Nota de teste isolada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: /Fixture CRM isolada/ })).toBeVisible();
  await page.getByLabel('Mover Fixture CRM isolada').selectOption('NEGOTIATING');
  await expect(page.getByLabel('Mover Fixture CRM isolada')).toHaveValue('NEGOTIATING');
  await page.reload();
  await expect(page.getByLabel('Mover Fixture CRM isolada')).toHaveValue('NEGOTIATING');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`crm-${width}.png`), fullPage: true });
  }
  await page.goto('/prospecting');
  await expect(page.getByRole('heading', { name: 'Explore o Brasil' })).toBeVisible();
  expect(googleRequests).toEqual([]);
});
