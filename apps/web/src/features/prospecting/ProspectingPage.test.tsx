import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi } from '@/features/auth/auth-api';
import { ProspectingPage } from './ProspectingPage';
vi.mock('./ProspectingMap', () => ({
  default: ({
    onBoundsChange,
  }: {
    onBoundsChange: (bounds: { west: number; south: number; east: number; north: number }) => void;
  }) => (
    <button
      onClick={() => onBoundsChange({ west: -47.95, south: -15.85, east: -47.85, north: -15.75 })}
    >
      Simular navegação do mapa
    </button>
  ),
}));
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
    await waitFor(() => expect(authApi).toHaveBeenCalledTimes(2));
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

function externalFixtures(places: { id: string; displayName?: { text: string } }[]) {
  vi.mocked(authApi).mockImplementation(async (path) => {
    if (path.endsWith('/usage'))
      return { configured: true, hour: 0, day: 0, hourLimit: 20, dayLimit: 100 } as never;
    if (path.endsWith('/assignees') || path.endsWith('/places/references')) return [] as never;
    if (path.includes('/leads?')) return { items: [], total: 0, pageSize: 30 } as never;
    if (path.endsWith('/places/search'))
      return { places, references: [], nextPageToken: null } as never;
    throw new Error('Unexpected request');
  });
}
it('busca nesta área só após clique e não mistura filtros de localidade', async () => {
  vi.stubEnv('VITE_GEOAPIFY_MAPS_KEY', 'test-browser-key');
  externalFixtures([]);
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mapa Geoapify' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Simular navegação do mapa' }));
  expect(vi.mocked(authApi).mock.calls.some(([p]) => p.endsWith('/places/search'))).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Buscar nesta área' }));
  await waitFor(() =>
    expect(authApi).toHaveBeenCalledWith(
      '/prospecting/places/search',
      'POST',
      expect.objectContaining({
        bounds: { west: -47.95, south: -15.85, east: -47.85, north: -15.75 },
        state: undefined,
        city: undefined,
        region: undefined,
      }),
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Simular navegação do mapa' }));
  expect(vi.mocked(authApi).mock.calls.filter(([p]) => p.endsWith('/places/search'))).toHaveLength(
    1,
  );
});
it('não cadastra resultado sem nome como escritório confirmado', async () => {
  externalFixtures([{ id: 'geoapify_51abc' }]);
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Buscar no Geoapify' }));
  await userEvent.click(
    await screen.findByRole('button', { name: /Local sem identificação — validar/ }),
  );
  expect(screen.getByRole('note')).toHaveTextContent('Não é um escritório confirmado');
  expect(screen.getByRole('button', { name: 'Adicionar à prospecção' })).toBeDisabled();
  expect(vi.mocked(authApi).mock.calls.some(([p]) => p.endsWith('/leads'))).toBe(false);
});
it('resposta atrasada de detalhes não muda seleção atual', async () => {
  externalFixtures([
    { id: 'geoapify_51abc', displayName: { text: 'Empresa A' } },
    { id: 'geoapify_51def', displayName: { text: 'Empresa B' } },
  ]);
  const normal = vi.mocked(authApi).getMockImplementation()!;
  let resolveDetails: (value: never) => void = () => {};
  vi.mocked(authApi).mockImplementation((path, ...args) =>
    path.endsWith('/details')
      ? new Promise((resolve) => {
          resolveDetails = resolve;
        })
      : normal(path, ...args),
  );
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Buscar no Geoapify' }));
  await userEvent.click(await screen.findByRole('button', { name: /Empresa A/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar detalhes Geoapify' }));
  await userEvent.click(screen.getByRole('button', { name: /Empresa B/ }));
  resolveDetails({ id: 'geoapify_51abc', displayName: { text: 'Detalhes A' } } as never);
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Empresa B' })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('heading', { name: 'Detalhes A' })).not.toBeInTheDocument();
});

it('reconcilia conflito concorrente e oferece abrir o lead já existente', async () => {
  externalFixtures([{ id: 'geoapify_51abc', displayName: { text: 'Empresa existente' } }]);
  const normal = vi.mocked(authApi).getMockImplementation()!;
  let duplicate = false;
  vi.mocked(authApi).mockImplementation(async (path, ...args) => {
    if (path.endsWith('/places/references'))
      return (
        duplicate
          ? [
              {
                placeId: 'geoapify_51abc',
                lead: {
                  id: '11111111-1111-4111-8111-111111111111',
                  status: 'CONTACTED',
                  assigneeId: null,
                },
              },
            ]
          : []
      ) as never;
    if (path.endsWith('/leads')) {
      duplicate = true;
      throw Object.assign(new Error('duplicado'), {
        isAxiosError: true,
        response: { status: 409, data: { message: 'Este local já está no CRM.' } },
      });
    }
    return normal(path, ...args);
  });
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Buscar no Geoapify' }));
  await userEvent.click(await screen.findByRole('button', { name: /Empresa existente/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar à prospecção' }));
  expect(await screen.findByRole('button', { name: 'Abrir lead no CRM' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Adicionar à prospecção' })).not.toBeInTheDocument();
  expect(vi.mocked(authApi).mock.calls.filter(([p]) => p.endsWith('/leads'))).toHaveLength(1);
});

it('separa as visualizações e não consulta Places no CRM', async () => {
  mount(true);
  expect(await screen.findByText('Nenhum lead cadastrado')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Leads salvos' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Kanban' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Explorar mapa' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Buscar no Geoapify' })).not.toBeInTheDocument();
  expect(
    vi
      .mocked(authApi)
      .mock.calls.some(([path]) => path.endsWith('/usage') || path.includes('/places/')),
  ).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Leads salvos' }));
  expect(screen.getByRole('heading', { name: 'Leads da VYMPA' })).toBeInTheDocument();
});
it('Prospecção mantém mapa e filtros sem lista ou kanban e envia a localidade selecionada', async () => {
  externalFixtures([]);
  mount();
  expect(screen.queryByRole('button', { name: 'Leads salvos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Kanban' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Novo lead' })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Região'), 'Sudeste');
  await userEvent.selectOptions(screen.getByLabelText('Estado'), 'SP');
  await userEvent.type(screen.getByLabelText('Cidade'), 'São Paulo');
  await userEvent.click(await screen.findByRole('button', { name: 'Buscar no Geoapify' }));
  await waitFor(() =>
    expect(authApi).toHaveBeenCalledWith(
      '/prospecting/places/search',
      'POST',
      expect.objectContaining({
        segment: 'ADVOCACIA',
        region: 'Sudeste',
        state: 'SP',
        city: 'São Paulo',
        query: undefined,
      }),
    ),
  );
  expect(vi.mocked(authApi).mock.calls.some(([path]) => path.includes('/leads?'))).toBe(false);
});
