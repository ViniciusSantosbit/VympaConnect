import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi } from '@/features/auth/auth-api';
import { ProspectingPage } from './ProspectingPage';
vi.mock('@/features/auth/auth-api', () => ({
  authApi: vi.fn(),
  authMessage: () => 'Falha de conexão ou solicitação.',
}));
beforeEach(() => {
  vi.stubEnv('VITE_GEOAPIFY_MAPS_KEY', '');
  vi.resetAllMocks();
  vi.mocked(authApi).mockImplementation(async (path) => {
    if (path === '/prospecting/usage')
      return {
        configured: false,
        hour: 0,
        day: 0,
        details: 0,
        hourLimit: 20,
        dayLimit: 100,
      } as never;
    if (path === '/prospecting/assignees') return [] as never;
    if (path.startsWith('/prospecting/leads?'))
      return { items: [], total: 0, pageSize: 30 } as never;
    throw new Error('Unexpected test request');
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
function mount(crm = false) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>
        <ProspectingPage crm={crm} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Central de prospecção', () => {
  it('mostra integração pendente sem disparar buscas ou detalhes Geoapify', async () => {
    mount();
    expect(await screen.findByText('Integração Geoapify pendente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar no Geoapify' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Carregar mapa Geoapify' })).toBeDisabled();
    await waitFor(() => expect(authApi).toHaveBeenCalledTimes(3));
    expect(vi.mocked(authApi).mock.calls.some(([path]) => path.includes('/places/'))).toBe(false);
  });
  it('mantém CRM vazio operacional sem inventar leads', async () => {
    mount(true);
    expect(await screen.findByText('Nenhum lead cadastrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo lead' })).toBeEnabled();
  });
  it('distingue erro de carregamento de CRM vazio', async () => {
    const original = vi.mocked(authApi).getMockImplementation()!;
    vi.mocked(authApi).mockImplementation((path, ...rest) =>
      path.startsWith('/prospecting/leads?')
        ? Promise.reject(new Error('failure'))
        : original(path, ...rest),
    );
    mount(true);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha');
    expect(screen.queryByText('Nenhum lead cadastrado')).not.toBeInTheDocument();
  });
  it('consulta Geoapify somente após clique e permite detalhes sob demanda', async () => {
    vi.mocked(authApi).mockImplementation(async (path) => {
      if (path === '/prospecting/usage')
        return { configured: true, hour: 0, day: 0, hourLimit: 20, dayLimit: 100 } as never;
      if (path === '/prospecting/assignees') return [] as never;
      if (path.includes('/leads?')) return { items: [], total: 0, pageSize: 30 } as never;
      if (path.endsWith('/places/references')) return [] as never;
      if (path.endsWith('/places/search'))
        return {
          places: [{ id: 'test_place', displayName: { text: 'Estabelecimento de teste isolado' } }],
          references: [],
          nextPageToken: null,
        } as never;
      return { id: 'test_place' } as never;
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Buscar no Geoapify' })).toBeEnabled(),
    );
    expect(vi.mocked(authApi).mock.calls.some(([path]) => path.includes('/places/'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Buscar no Geoapify' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Estabelecimento de teste isolado/ }),
    );
    expect(vi.mocked(authApi).mock.calls.some(([path]) => path.includes('/details'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Consultar detalhes Geoapify' }));
    await waitFor(() =>
      expect(authApi).toHaveBeenCalledWith('/prospecting/places/test_place/details', 'POST'),
    );
  });
});
