import { test, expect } from '@playwright/test';

// Provider/API fixtures only in this suite; the separate audit command uses real Auth and SQL.
test('mapa: limites visíveis, clique explícito e local incompleto', async ({ page }) => {
  let searches = 0;
  await page.route('https://maps.geoapify.com/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { email: 'fixture@example.invalid', role: 'ADMIN', state: 'ready', factors: [] },
      });
    if (path.endsWith('/usage'))
      return route.fulfill({
        json: { configured: true, hour: 0, day: 0, hourLimit: 20, dayLimit: 100 },
      });
    if (path.endsWith('/assignees') || path.endsWith('/places/references'))
      return route.fulfill({ json: [] });
    if (path.endsWith('/leads'))
      return route.fulfill({ json: { items: [], total: 0, pageSize: 30 } });
    if (path.endsWith('/places/search')) {
      searches++;
      const body = route.request().postDataJSON();
      expect(body.bounds.west).toBeLessThan(body.bounds.east);
      expect(body.bounds.east - body.bounds.west).toBeLessThanOrEqual(2);
      expect(body.bounds.north - body.bounds.south).toBeLessThanOrEqual(2);
      expect(body).not.toHaveProperty('city');
      expect(body).not.toHaveProperty('state');
      return route.fulfill({
        json: {
          places: [{ id: 'geoapify_51abc', location: { latitude: -15.8, longitude: -47.9 } }],
          references: [],
          nextPageToken: null,
        },
      });
    }
    return route.fulfill({ status: 404, json: { message: 'Fixture route missing' } });
  });
  await page.goto('/prospecting');
  await page.getByRole('button', { name: 'Carregar mapa Geoapify' }).click();
  await expect(page.getByRole('button', { name: 'Buscar nesta área' })).toBeDisabled();
  for (
    let i = 0;
    i < 12 && (await page.getByRole('button', { name: 'Buscar nesta área' }).isDisabled());
    i++
  ) {
    await page.locator('.leaflet-control-zoom-in').click();
    // Leaflet ignores new zoom commands while its 250ms transition is running.
    await page.waitForTimeout(300);
    await expect(page.locator('.leaflet-container.leaflet-zoom-anim')).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Buscar nesta área' })).toBeEnabled();
  expect(searches).toBe(0);
  await page.getByRole('button', { name: 'Buscar nesta área' }).click();
  await expect(page.locator('.place-result')).toHaveCount(1);
  expect(searches).toBe(1);
  await page.locator('.place-result').click();
  await expect(page.getByRole('note')).toContainText('Não é um escritório confirmado');
  await expect(page.getByRole('button', { name: 'Adicionar à prospecção' })).toBeDisabled();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
});

test('backend indisponível mostra erro sem inventar leads', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { email: 'fixture@example.invalid', role: 'ADMIN', state: 'ready', factors: [] },
      });
    return route.abort('failed');
  });
  await page.goto('/crm');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Sem conexão com o servidor' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Nenhum lead cadastrado')).not.toBeVisible();
  await expect(page.locator('.kanban-card')).toHaveCount(0);
});
