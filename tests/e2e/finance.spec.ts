import { test, expect, type Page } from '@playwright/test';
import { offeringDefaults, provisionalRules } from '@vympa/shared';
const actorId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
async function fixtures(page: Page, role = 'OWNER') {
  let managementRequests = 0;
  const records: Record<string, unknown>[] = [];
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { email: 'fixture@example.invalid', role, state: 'ready', factors: [] },
      });
    if (path.endsWith('/prospecting/assignees'))
      return route.fulfill({ json: [{ id: actorId, email: 'fixture@example.invalid' }] });
    if (path.endsWith('/prospecting/leads'))
      return route.fulfill({ json: { items: [], total: 0, pageSize: 30 } });
    if (path.endsWith('/finance/catalog'))
      return route.fulfill({
        json: offeringDefaults.map((o, i) => ({
          ...o,
          id: String(i),
          monthlyCents: null,
          baseCents: null,
          setupCents: null,
          operatingCents: null,
          active: true,
          version: 1,
          priceHistory: [],
        })),
      });
    if (path.endsWith('/finance/discount-policy'))
      return route.fulfill({
        json: { id: 'default', rules: provisionalRules, provisional: true, version: 0 },
      });
    if (path.endsWith('/finance/simulations')) return route.fulfill({ json: [] });
    if (path.includes('/finance/management/')) {
      managementRequests++;
      if (role !== 'OWNER')
        return route.fulfill({
          status: 403,
          json: { message: 'Papel administrativo insuficiente.' },
        });
      if (path.endsWith('/summary'))
        return route.fulfill({
          json: {
            period: '2026-10',
            receivedCents: 0,
            paidCents: 0,
            balanceCents: 0,
            resultCents: 0,
            pendingIncomeCents: records.length ? 10000 : 0,
            pendingExpenseCents: 0,
            forecastCents: records.length ? 10000 : 0,
            aiCents: 0,
            infrastructureCents: 0,
            investmentCents: 0,
            opening: null,
            months: [],
          },
        });
      if (path.endsWith('/categories'))
        return route.fulfill({
          json: [
            { id: categoryId, name: 'Outras despesas', group: 'GENERAL', active: true, version: 1 },
          ],
        });
      if (path.endsWith('/transactions')) {
        if (route.request().method() === 'POST') {
          const data = route.request().postDataJSON();
          expect(data.status).toBe('PENDING');
          expect(data.settledOn).toBeNull();
          expect(data.amountCents).toBe(10000);
          const item = {
            ...data,
            id: '33333333-3333-4333-8333-333333333333',
            version: 1,
            categoryGroup: 'GENERAL',
            category: { name: 'Outras despesas' },
          };
          records.push(item);
          return route.fulfill({ status: 201, json: item });
        }
        return route.fulfill({
          json: { items: records, total: records.length, page: 1, pageSize: 30 },
        });
      }
      return route.fulfill({ json: [] });
    }
    if (path.endsWith('/dashboard/summary'))
      return route.fulfill({
        json: {
          generatedAt: new Date().toISOString(),
          businessStatus: 'prospecting_ready',
          metrics: {
            leads: 0,
            negotiations: 0,
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
        },
      });
    return route.fulfill({ status: 404, json: { message: 'Fixture route missing' } });
  });
  return { managementRequests: () => managementRequests };
}
test('financeiro: dois cards separados e exemplo comercial instantâneo', async ({ page }) => {
  await fixtures(page);
  await page.goto('/finance');
  await expect(
    page.getByRole('heading', { name: 'Simulador de Propostas e Planos', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Gestão Financeira da VYMPA', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Simulador de Propostas e Planos/ }).click();
  await expect(page).toHaveURL(/\/finance\/simulator$/);
  const cost = page.getByLabel('Custo mensal atual total (R$)', { exact: true });
  await expect(cost).toHaveValue('');
  await cost.fill('10000,00');
  await expect(
    page.locator('.finance-metric').filter({ hasText: 'Proposta VYMPA / mês' }),
  ).toContainText('8.600,00');
  await expect(
    page.locator('.finance-metric').filter({ hasText: 'Economia em 12 meses' }),
  ).toContainText('16.800,00');
  await expect(page.getByText(/Margem não calculada/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
test('ADMIN não acessa gestão financeira nem solicita dados privados', async ({ page }) => {
  const f = await fixtures(page, 'ADMIN');
  await page.goto('/finance');
  await expect(page.getByText('Acesso exclusivo OWNER')).toBeVisible();
  await page.goto('/finance/management');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(f.managementRequests()).toBe(0);
});
test('receita pendente permanece fora do caixa e aparece após recarga', async ({ page }) => {
  await fixtures(page);
  await page.goto('/finance/management');
  await page.getByRole('button', { name: 'Nova receita' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição', { exact: true }).fill('TESTE receita pendente');
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('100,00');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption(categoryId);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('TESTE receita pendente', { exact: true })).toBeVisible();
  await expect(
    page.locator('.finance-metric').filter({ hasText: 'Saldo de caixa até o fim do período' }),
  ).toContainText('0,00');
  await page.reload();
  await expect(page.getByText('TESTE receita pendente', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
