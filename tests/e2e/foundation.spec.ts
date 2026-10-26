import { test, expect } from '@playwright/test';
test('fundação e navegação sem apresentar funcionalidades fictícias', async ({
  page,
  isMobile,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fundação pronta para evoluir.' })).toBeVisible();
  await expect(page.getByText('Ambiente sem autenticação · Não inserir dados reais')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('foundation.png'), fullPage: true });
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('link', { name: /CRM/ }).click();
  await expect(page.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible();
  await expect(
    page.getByText('Módulo planejado. Funcionalidade ainda não implementada.'),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
