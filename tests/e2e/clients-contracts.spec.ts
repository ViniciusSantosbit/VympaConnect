import { test, expect, type Page } from '@playwright/test';
const actor = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222';
async function fixture(page: Page, role = 'OWNER') {
  const records: Record<string, unknown>[] = [];
  const contracts: Record<string, unknown>[] = [];
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { email: 'owner@example.invalid', role, state: 'ready', factors: [] },
      });
    if (path.endsWith('/prospecting/assignees'))
      return route.fulfill({ json: [{ id: actor, email: 'owner@example.invalid' }] });
    if (path.endsWith('/contracts/summary'))
      return route.fulfill({
        json: {
          totalClients: records.length,
          activeClients: 0,
          onboarding: 0,
          active: 0,
          expired: 0,
          pendingSignature: 0,
          expiring: 0,
          renewals: 0,
          monthlyContractedCents: role === 'OWNER' ? '0' : null,
          unpriced: 0,
        },
      });
    if (path.endsWith('/clients')) {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON();
        const c = {
          ...input,
          id,
          status: 'PROSPECT',
          responsible: { id: actor, email: 'owner@example.invalid' },
          version: 1,
          createdAt: '2026-10-29',
          contacts: [],
          services: [],
          leads: [],
        };
        records.push(c);
        return route.fulfill({ status: 201, json: c });
      }
      return route.fulfill({
        json: { items: records, total: records.length, page: 1, pageSize: 30 },
      });
    }
    if (path.endsWith('/clients/' + id)) return route.fulfill({ json: records[0] });
    if (path.endsWith('/contracts')) {
      if (route.request().method() === 'POST') {
        const d = route.request().postDataJSON();
        const c = {
          ...d,
          id,
          status: 'DRAFT',
          effectiveStatus: 'DRAFT',
          client: { id, companyName: records[0]?.companyName },
          responsible: { id: actor, email: 'owner@example.invalid' },
          version: 1,
          services: d.serviceCodes.map((code: string) => ({ code })),
          history: [],
          amendments: [],
        };
        contracts.push(c);
        return route.fulfill({ status: 201, json: c });
      }
      return route.fulfill({
        json: { items: contracts, total: contracts.length, page: 1, pageSize: 30 },
      });
    }
    if (path.endsWith('/contracts/' + id)) return route.fulfill({ json: contracts[0] });
    if (path.endsWith('/contracts/' + id + '/documents'))
      return route.fulfill({
        json: {
          items: [],
          pending: 'Armazenamento privado ainda não configurado. Upload bloqueado.',
        },
      });
    if (path.endsWith('/contracts/expiring')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: 'Fixture não configurada' } });
  });
  return records;
}
test('cadastro, detalhes e contatos de cliente em desktop e mobile', async ({ page }) => {
  const records = await fixture(page);
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clientes VYMPA' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  await page.getByLabel('Nome empresarial').fill('Empresa de teste E2E');
  await page.getByLabel('Segmento', { exact: true }).selectOption('ADVOCACIA');
  await page.getByLabel('Responsável interno').selectOption(actor);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('link', { name: 'Empresa de teste E2E' }).click();
  await expect(page.getByRole('heading', { name: 'Empresa de teste E2E' })).toBeVisible();
  await page.getByRole('button', { name: 'Contatos', exact: true }).click();
  await expect(page.getByText('Nenhum contato cadastrado.')).toBeVisible();
  expect(records).toHaveLength(1);
  expect(records[0]?.status).toBe('PROSPECT');
});
test('contratos exibem estado vazio, vencimentos e acesso ADMIN sem valores', async ({ page }) => {
  await fixture(page, 'ADMIN');
  await page.goto('/contracts');
  await expect(page.getByRole('heading', { name: 'Contratos e Vigências' })).toBeVisible();
  await page.getByLabel('Antecedência').selectOption('7');
  await expect(page.getByText('Nenhum contrato encontrado.').first()).toBeVisible();
  await expect(page.getByText('Valor mensal contratado', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Novo rascunho' }).click();
  await expect(page.getByLabel('Mensalidade (R$)')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Preparar rascunho contratual' })).toBeVisible();
});
test('OWNER prepara e consulta rascunho contratual sem gerar receita', async ({
  page,
}, testInfo) => {
  const records = await fixture(page);
  records.push({
    id,
    companyName: 'Empresa contratante',
    segment: 'ADVOCACIA',
    status: 'PROSPECT',
    responsible: { id: actor, email: 'owner@example.invalid' },
  });
  await page.goto('/contracts');
  await page.getByRole('button', { name: 'Novo rascunho' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cliente', { exact: true }).selectOption(id);
  await dialog.getByLabel('Número do contrato').fill('CON-001');
  await dialog.getByLabel('Título', { exact: true }).fill('Sistema personalizado');
  await dialog.getByLabel('Responsável', { exact: true }).selectOption(actor);
  await dialog.getByLabel('Implantação (R$)').fill('1000,00');
  await dialog.getByLabel('Mensalidade (R$)').fill('300,00');
  await dialog.getByLabel('Sistemas personalizados com IA').check();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('link', { name: 'CON-001 · Sistema personalizado' }).click();
  await expect(
    page.getByRole('heading', { name: 'CON-001 · Sistema personalizado' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar rascunho' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload indisponível' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Registrar cobrança prevista' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('contract-details.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
