import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';
import { authApi } from './auth-api';
vi.mock('./auth-api', () => ({
  authApi: vi.fn(),
  initializeCsrf: vi.fn(async () => {}),
  clearCsrf: vi.fn(),
  authMessage: () => 'Rede indisponível',
}));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
function Consumer() {
  const { session, loading, error, logout } = useAuth();
  return (
    <>
      <p>{loading ? 'Restaurando' : (session?.email ?? 'Sem sessão')}</p>
      {error && <p role="alert">{error}</p>}
      <button
        onClick={() => {
          void logout();
        }}
      >
        Sair
      </button>
    </>
  );
}
function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}
const ready = { state: 'ready', email: 'owner@example.invalid', role: 'OWNER', factors: [] };
describe('Restauração e encerramento da sessão', () => {
  it('restaura a sessão pela resposta do backend sem usar storage', async () => {
    vi.mocked(authApi).mockResolvedValue(ready);
    renderProvider();
    expect(screen.getByText('Restaurando')).toBeInTheDocument();
    expect(await screen.findByText(ready.email)).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it('encerra a sessão e limpa dados administrativos em cache', async () => {
    vi.mocked(authApi)
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce({ remoteRevocationPending: false });
    const client = renderProvider();
    await screen.findByText(ready.email);
    client.setQueryData(['admin-users'], ['private-test-record']);
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByText('Sem sessão')).toBeInTheDocument();
    expect(client.getQueryData(['admin-users'])).toBeUndefined();
  });
  it('falha de rede não libera o painel', async () => {
    vi.mocked(authApi).mockRejectedValueOnce(new Error('test-only-network-failure'));
    renderProvider();
    expect(await screen.findByRole('alert')).toHaveTextContent('Rede indisponível');
    expect(screen.getByText('Sem sessão')).toBeInTheDocument();
  });
  it('resposta 401 não é tratada como sessão restaurada', async () => {
    vi.mocked(authApi).mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
    renderProvider();
    await waitFor(() => expect(screen.getByText('Sem sessão')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
