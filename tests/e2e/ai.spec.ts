import { test, expect, type Page } from '@playwright/test';
const chat = '22222222-2222-4222-8222-222222222222';
async function fixtures(
  page: Page,
  options: {
    failure?: number;
    configured?: boolean;
    existing?: boolean;
    hold?: boolean;
    processing?: boolean;
  } = {},
) {
  const sent: Record<string, unknown>[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0,
    records = options.existing
      ? [{ id: chat, title: 'Conversa fixture', updatedAt: '2026-10-29T15:00:00Z' }]
      : [];
  const messages: Record<string, unknown>[] = options.existing
    ? [
        {
          id: 'old',
          question: 'Pergunta antiga',
          answer: '**Resposta antiga**',
          status: 'COMPLETED',
        },
      ]
    : [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { state: 'ready', role: 'OWNER', email: 'fixture@example.invalid', factors: [] },
      });
    if (path.endsWith('/ai/status'))
      return route.fulfill({
        json: {
          enabled: true,
          configured: options.configured !== false,
          ready: options.configured !== false,
          model: 'gemini-3.5-flash-lite',
          reason: null,
          pending: options.processing
            ? { conversationId: chat, createdAt: '2026-10-29T15:00:00Z' }
            : null,
        },
      });
    if (path.endsWith('/ai/conversations')) {
      if (method === 'POST') {
        records = [
          {
            id: chat,
            title: route.request().postDataJSON().title,
            updatedAt: '2026-10-29T15:00:00Z',
          },
        ];
        return route.fulfill({ status: 201, json: records[0] });
      }
      return route.fulfill({ json: { items: records, total: records.length } });
    }
    if (path.endsWith('/messages')) {
      if (method === 'POST') {
        calls++;
        const body = route.request().postDataJSON();
        sent.push(body);
        if (options.hold) await gate;
        else await new Promise((resolve) => setTimeout(resolve, 700));
        if (options.failure)
          return route.fulfill({
            status: options.failure,
            json: { message: 'Erro interno do servidor' },
          });
        const m = {
          ...body,
          id: 'm' + calls,
          answer:
            'Nenhum contrato encontrado.\n\n**Resumo**\n\n1. Nenhum vencimento.\n\n<script>window.compromised=true</script>\n\n![x](https://evil.invalid/x)',
          status: 'COMPLETED',
        };
        messages.push(m);
        return route.fulfill({ status: 201, json: m });
      }
      return route.fulfill({ json: { items: messages, total: messages.length } });
    }
    if (path.endsWith('/ai/conversations/' + chat) && method === 'DELETE') {
      records = [];
      messages.length = 0;
      return route.fulfill({ json: { deleted: true } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return { calls: () => calls, sent: () => sent, release };
}
test('chat: pergunta imediata, pontos, Markdown seguro e persistência após recarga', async ({
  page,
}) => {
  const fixture = await fixtures(page, { hold: true });
  await page.goto('/ai');
  await expect(page.getByText('Modelo 3.5-flash-lite · consultas autorizadas')).toBeVisible();
  await page.getByRole('textbox').fill('Quais contratos vencem neste mês?');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.getByTestId('optimistic-exchange')).toContainText(
    'Quais contratos vencem neste mês?',
  );
  await expect(page.getByText('Preparando resposta…')).toBeVisible();
  fixture.release();
  await expect(page.locator('.ai-markdown strong')).toHaveText('Resumo');
  await expect(page.locator('.ai-markdown script, .ai-markdown img')).toHaveCount(0);
  expect(fixture.calls()).toBe(1);
  await page.reload();
  await page
    .getByRole('button', { name: /Quais contratos vencem neste mês\?.*29\/10\/2026/ })
    .click();
  await expect(page.locator('.ai-markdown')).toContainText('Nenhum contrato encontrado.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'test-results/ai-' + test.info().project.name + '.png',
    fullPage: true,
  });
});
test('nova conversa, histórico e exclusão autorizada pela interface', async ({ page }) => {
  await fixtures(page, { existing: true });
  await page.goto('/ai');
  await page.getByRole('button', { name: /Conversa fixture.*29\/10\/2026/ }).click();
  await expect(page.getByText('Resposta antiga')).toBeVisible();
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await expect(page.getByText('Como posso ajudar?')).toBeVisible();
  await page.getByRole('button', { name: 'Excluir conversa: Conversa fixture' }).click();
  await expect(page.getByText('Nenhuma conversa salva.')).toBeVisible();
});
test('sem configuração bloqueia envio', async ({ page }) => {
  await fixtures(page, { configured: false });
  await page.goto('/ai');
  await expect(page.getByRole('textbox')).toBeDisabled();
  await expect(page.getByText('VYMPAI ainda não configurada')).toBeVisible();
});
for (const failure of [429, 503, 504])
  test('falha ' + failure + ' encerra processamento sem repetição', async ({ page }) => {
    const fixture = await fixtures(page, { failure });
    await page.goto('/ai');
    await page.getByRole('textbox').fill('Pergunta isolada');
    await page.getByRole('button', { name: 'Enviar pergunta' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Preparando resposta…')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toBeEnabled();
    expect(fixture.calls()).toBe(1);
  });
test('parar espera remove animação; movimento reduzido não pulsa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await fixtures(page, { hold: true });
  await page.goto('/ai');
  await page.getByRole('textbox').fill('Pergunta isolada');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.locator('.ai-dots i').first()).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Parar espera' }).click();
  fixture.release();
  await expect(page.getByRole('alert')).toContainText('Espera interrompida');
  await expect(page.getByTestId('optimistic-exchange')).toHaveCount(0);
});

test('recarregar com processamento ativo bloqueia novo envio e permite retomar a conversa', async ({
  page,
}) => {
  const fixture = await fixtures(page, { processing: true, existing: true });
  await page.goto('/ai');
  await expect(
    page.getByText(
      'Uma pergunta ainda está sendo processada. Aguarde a conclusão antes de enviar outra.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toBeDisabled();
  await page.getByRole('button', { name: 'Abrir conversa em processamento' }).click();
  await expect(page.getByText('Resposta antiga')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar pergunta' })).toBeDisabled();
  expect(fixture.calls()).toBe(0);
});
