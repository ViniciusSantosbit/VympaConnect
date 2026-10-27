import { test, expect } from '@playwright/test';

test('rotas privadas levam ao login sem sessão e mantêm layout responsivo', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Contrato de sessão ausente simulado apenas neste smoke de interface; não valida Auth real.
  await page.route('**/api/v1/auth/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'a'.repeat(64) } }),
  );
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({ status: 401, json: { message: 'Sessão ausente' } }),
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entre no seu workspace' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(
    page.getByText('O acesso exige convite e autenticador. Não há cadastro público.'),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.getByRole('link', { name: 'Recuperar acesso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar acesso' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
