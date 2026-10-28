import { test, expect } from '@playwright/test';

const routes = [
  '/dashboard',
  '/prospecting',
  '/crm',
  '/finance',
  '/goals',
  '/clients',
  '/contracts',
  '/ai',
  '/admin',
  '/settings',
];
// Fixtures exclusivamente de teste: não criam sessão, conta ou dados no ambiente real.
const summary = {
  generatedAt: '2026-10-28T12:00:00Z',
  businessStatus: 'modules_pending',
  metrics: {
    leads: null,
    negotiations: null,
    closedContracts: null,
    activeClients: null,
    monthlyRevenue: null,
    monthlyExpenses: null,
    balance: null,
    goalProgress: null,
  },
  finance: [],
  commercial: [],
  funnel: [],
  contracts: [],
  goals: [],
  activities: [],
};

test('todas as rotas do workspace recusam acesso sem sessão', async ({ page }) => {
  await page.route('**/api/v1/auth/csrf', (r) =>
    r.fulfill({ json: { csrfToken: 'a'.repeat(64) } }),
  );
  await page.route('**/api/v1/auth/session', (r) =>
    r.fulfill({ status: 401, json: { message: 'Sessão ausente' } }),
  );
  for (const path of routes) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entre no seu workspace' })).toBeVisible();
  }
});

test('MFA pendente impede o dashboard', async ({ page }) => {
  await page.route('**/api/v1/auth/csrf', (r) =>
    r.fulfill({ json: { csrfToken: 'a'.repeat(64) } }),
  );
  await page.route('**/api/v1/auth/session', (r) =>
    r.fulfill({
      json: {
        email: 'test@example.invalid',
        role: 'OWNER',
        state: 'mfa_verify',
        factors: [{ id: 'test-factor', name: 'Teste' }],
      },
    }),
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/mfa$/);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).not.toBeVisible();
});

for (const [width, height] of [
  [1920, 1080],
  [1366, 768],
  [820, 1180],
  [390, 844],
]) {
  test(`dashboard responsivo ${width}: navegação e logout com contrato simulado`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    let loggedOut = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/v1/auth/csrf', (r) =>
      r.fulfill({ json: { csrfToken: 'a'.repeat(64) } }),
    );
    await page.route('**/api/v1/auth/session', (r) =>
      loggedOut
        ? r.fulfill({ status: 401, json: { message: 'Sessão encerrada' } })
        : r.fulfill({
            json: { email: 'test@example.invalid', role: 'OWNER', state: 'ready', factors: [] },
          }),
    );
    await page.route('**/api/v1/dashboard/summary', (r) => r.fulfill({ json: summary }));
    await page.route('**/api/v1/auth/logout', (r) => {
      loggedOut = true;
      return r.fulfill({ json: { loggedOut: true, remoteRevocationPending: false } });
    });
    await page.setViewportSize({ width, height });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
    await expect(page.locator('.kpi-grid')).toHaveCSS('display', 'grid');
    expect(
      await page
        .locator('.kpi-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
    ).toBe(width > 900 ? 4 : 2);
    await expect(page.getByText('Ainda não existem dados financeiros')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    if (width > 760) {
      await page.getByRole('button', { name: 'Recolher navegação' }).click();
      await expect(page.getByRole('button', { name: 'Expandir navegação' })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Abrir navegação' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('link', { name: 'Clientes', exact: true }).click();
      await expect(page).toHaveURL(/\/clients$/);
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
    await page.locator('summary').click();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  });
}
