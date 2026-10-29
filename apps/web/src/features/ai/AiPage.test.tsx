import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { CanceledError } from 'axios';
import { authApi } from '@/features/auth/auth-api';
import { AiPage } from './AiPage';
import { AiResponse } from './AiResponse';
vi.mock('@/features/auth/auth-api', () => ({
  authApi: vi.fn(),
  authMessage: () => 'Falha de conexão.',
}));
const status = {
  ready: true,
  enabled: true,
  configured: true,
  model: 'gemini-3.5-flash-lite',
  reason: null,
};
const conversation = { id: 'chat', title: 'Conversa isolada', updatedAt: '2026-10-29T15:00:00Z' };
let records: (typeof conversation)[], messages: Record<string, unknown>[], ready: boolean;
let backendPending: { conversationId: string; createdAt: string } | null;
let answer: () => Promise<unknown>;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AiPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  backendPending = null;
  records = [];
  messages = [];
  ready = true;
  answer = async () => ({
    id: 'm',
    question: 'Pergunta isolada',
    answer: '**Resposta** segura.',
    status: 'COMPLETED',
  });
  vi.mocked(authApi).mockImplementation(
    async (path, method = 'GET', _data, _retry, _timeout, signal) => {
      if (path === '/ai/status')
        return { ...status, ready, configured: ready, pending: backendPending } as never;
      if (path === '/ai/conversations' && method === 'POST') {
        records.push(conversation);
        return conversation as never;
      }
      if (path.startsWith('/ai/conversations?'))
        return { items: records, total: records.length } as never;
      if (method === 'DELETE') {
        records = [];
        messages = [];
        return { deleted: true } as never;
      }
      if (method === 'POST') {
        return (await Promise.race([
          answer(),
          new Promise((_, reject) =>
            signal?.addEventListener('abort', () => reject(new CanceledError())),
          ),
        ])) as never;
      }
      return { items: messages, total: messages.length } as never;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('VYMPAI', () => {
  it('renderiza listas e destaque, sem HTML, scripts, imagens ou links externos', () => {
    const { container } = render(
      <AiResponse
        text={
          '**Resumo**\n\n1. Resultado\n\n<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[abrir](javascript:alert(1))\n\n![segredo](https://evil.invalid/collect)'
        }
      />,
    );
    expect(screen.getByText('Resumo').tagName).toBe('STRONG');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('script, img, a, iframe')).toBeNull();
  });
  it('mostra exatamente a versão selecionada pelo backend sem marca do provedor', async () => {
    mount();
    expect(await screen.findByText('Modelo 3.5-flash-lite · consultas autorizadas')).toBeVisible();
    expect(screen.queryByText(/Gemini/i)).not.toBeInTheDocument();
  });
  it('sem chave impede envio e permite verificar configuração', async () => {
    ready = false;
    mount();
    expect(await screen.findByText('VYMPAI ainda não configurada')).toBeVisible();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
  it('mostra pergunta e pontos imediatamente, e um clique não duplica geração', async () => {
    let finish!: (value: unknown) => void;
    answer = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
    await user.type(screen.getByRole('textbox'), 'Pergunta isolada');
    await user.dblClick(screen.getByRole('button', { name: 'Enviar pergunta' }));
    expect(screen.getByTestId('optimistic-exchange')).toHaveTextContent('Pergunta isolada');
    expect(screen.getByText('Preparando resposta…')).toBeVisible();
    expect(
      vi.mocked(authApi).mock.calls.filter((c) => c[1] === 'POST' && c[0].endsWith('/messages')),
    ).toHaveLength(1);
    messages = [
      {
        id: 'm',
        question: 'Pergunta isolada',
        answer: '**Resposta** segura.',
        status: 'COMPLETED',
      },
    ];
    finish(messages[0]);
    expect(await screen.findByText('Resposta')).toBeVisible();
    expect(screen.queryByText('Preparando resposta…')).not.toBeInTheDocument();
  });
  it.each([429, 502, 503, 504])(
    'remove indicador após HTTP %s sem tentar novamente',
    async (code) => {
      answer = async () => {
        throw { isAxiosError: true, response: { status: code, data: { message: 'Aguarde.' } } };
      };
      mount();
      const user = userEvent.setup();
      await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
      await user.type(screen.getByRole('textbox'), 'Pergunta isolada{Enter}');
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(screen.queryByText('Preparando resposta…')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeEnabled();
    },
  );
  it('interrompe espera sem manter indicador preso', async () => {
    answer = () => new Promise(() => {});
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
    await user.type(screen.getByRole('textbox'), 'Pergunta isolada{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Parar espera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera interrompida');
    expect(screen.queryByText('Preparando resposta…')).not.toBeInTheDocument();
  });
  it('recarrega histórico e exclui conversa selecionada', async () => {
    records = [conversation];
    messages = [{ id: 'm', question: 'Antiga', answer: 'Resposta antiga', status: 'COMPLETED' }];
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Conversa isolada.*29\/10\/2026/ }));
    expect(await screen.findByText('Resposta antiga')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Excluir conversa: Conversa isolada' }));
    expect(await screen.findByText('Nenhuma conversa salva.')).toBeVisible();
    expect(screen.getByText('Como posso ajudar?')).toBeVisible();
  });
});

it('ao recarregar ou parar espera, bloqueia envio enquanto o backend ainda trabalha', async () => {
  backendPending = { conversationId: 'chat', createdAt: '2026-10-29T15:00:00Z' };
  mount();
  expect(
    await screen.findByText(
      'Uma pergunta ainda está sendo processada. Aguarde a conclusão antes de enviar outra.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Enviar pergunta' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Abrir conversa em processamento' })).toBeVisible();
});
