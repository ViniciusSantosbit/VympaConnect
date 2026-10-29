import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import type { ReactNode } from 'react';
import { authApi } from '@/features/auth/auth-api';
import { GoalsPage, GoalList, GoalDetails } from './GoalsPage';
import { GoalTeamPage } from './GoalAnalyticsPage';
import { GoalEditor } from './GoalEditor';
const state = vi.hoisted(() => ({ role: 'OWNER' }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { role: state.role } }),
}));
vi.mock('@/features/auth/auth-api', () => ({
  authApi: vi.fn(),
  authMessage: () => 'Falha de conexão.',
}));
const actor = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222';
const goal = {
  id,
  title: 'Prospectar escritórios',
  description: 'Objetivo isolado',
  category: 'COMMERCIAL',
  metric: 'NEW_LEADS',
  mode: 'AUTO',
  direction: 'GROWTH',
  unit: 'COUNT',
  target: '100',
  baseline: null,
  startsOn: '2026-10-01',
  endsOn: '2026-10-31',
  priority: 'HIGH',
  periodicity: 'MONTHLY',
  segment: null,
  scope: 'ASSIGNED',
  adminVisible: false,
  allowManualUpdates: false,
  alertDays: 7,
  notes: null,
  blocked: false,
  cancelledAt: null,
  version: 1,
  assignments: [{ profileId: actor, profile: { id: actor, email: 'owner@example.invalid' } }],
  progress: {
    value: '150',
    target: '100',
    baseline: null,
    unit: 'COUNT',
    percent: 150,
    barPercent: 100,
    remaining: '0',
    status: 'ACHIEVED',
    withinLimit: null,
    available: true,
    reason: null,
    source: 'Leads criados no período.',
    updatedAt: '2026-10-29T12:00:00Z',
    cutoff: '2026-10-29',
    phase: 'Alcance da meta',
  },
};
beforeEach(() => {
  state.role = 'OWNER';
  vi.resetAllMocks();
  vi.mocked(authApi).mockImplementation(async (path, method) => {
    if (path === '/prospecting/assignees')
      return [{ id: actor, email: 'owner@example.invalid' }] as never;
    if (path === '/goals/summary')
      return {
        total: 0,
        active: 0,
        achieved: 0,
        atRisk: 0,
        overdue: 0,
        expiring: 0,
        financialInProgress: 0,
        commercialProgress: null,
        items: [],
      } as never;
    if (path.startsWith('/goals/team?'))
      return { people: [], source: 'Somente usuários existentes.' } as never;
    if (path.startsWith('/goals?')) return { items: [], total: 0, page: 1, pageSize: 30 } as never;
    if (path === '/goals/' + id) return goal as never;
    if (path.startsWith('/goals/' + id + '/history')) return [] as never;
    if (path === '/goals' && method === 'POST') return goal as never;
    throw new Error('Unexpected fixture ' + path);
  });
});
afterEach(cleanup);
function mount(el: ReactNode, path = '/goals') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/goals" element={el} />
          <Route path="/goals/detail/:id" element={el} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Central de Metas', () => {
  it('apresenta quatro áreas independentes sem metas fictícias', async () => {
    mount(<GoalsPage />);
    await screen.findByText('Nenhuma meta autorizada próxima do prazo.');
    for (const title of [
      'Metas Comerciais',
      'Metas Financeiras',
      'Metas por Sócio',
      'Indicadores Estratégicos',
    ])
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Abrir/ })).toHaveLength(4);
  });
  it('ADMIN só recebe links das áreas autorizadas', async () => {
    state.role = 'ADMIN';
    mount(<GoalsPage />);
    await screen.findByText('Nenhuma meta autorizada próxima do prazo.');
    expect(screen.queryByRole('link', { name: 'Abrir metas financeiras' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Abrir indicadores estratégicos' }),
    ).not.toBeInTheDocument();
  });
  it('lista estado vazio e muda filtros por status sem criar dados', async () => {
    mount(<GoalList category="COMMERCIAL" />);
    await screen.findByRole('heading', { name: 'Nenhuma meta encontrada' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'AT_RISK');
    await waitFor(() =>
      expect(vi.mocked(authApi).mock.calls.some(([p]) => p.includes('status=AT_RISK'))).toBe(true),
    );
  });
  it('cria uma meta automática com alvo em string e fonte explícita', async () => {
    mount(<GoalEditor onClose={vi.fn()} />);
    const d = within(screen.getByRole('dialog'));
    await userEvent.type(d.getByLabelText('Nome'), 'Prospectar novos escritórios');
    await userEvent.type(d.getByLabelText(/Valor-alvo/), '100');
    await userEvent.click(d.getByRole('button', { name: 'Salvar meta' }));
    await waitFor(() =>
      expect(authApi).toHaveBeenCalledWith(
        '/goals',
        'POST',
        expect.objectContaining({
          title: 'Prospectar novos escritórios',
          metric: 'NEW_LEADS',
          mode: 'AUTO',
          direction: 'GROWTH',
          target: '100',
          assigneeIds: [],
        }),
      ),
    );
  });
  it('converte valores monetários para centavos sem enviar ponto flutuante', async () => {
    mount(<GoalEditor category="FINANCIAL" onClose={vi.fn()} />);
    const d = within(screen.getByRole('dialog'));
    await userEvent.type(d.getByLabelText('Nome'), 'Receita recebida');
    await userEvent.type(d.getByLabelText(/Valor-alvo/), '1.000,99');
    await userEvent.click(d.getByRole('button', { name: 'Salvar meta' }));
    await waitFor(() =>
      expect(authApi).toHaveBeenCalledWith(
        '/goals',
        'POST',
        expect.objectContaining({
          category: 'FINANCIAL',
          metric: 'RECEIVED_INCOME',
          target: '100099',
          scope: 'COMPANY',
        }),
      ),
    );
  });
  it('alcance acima de 100% não estoura visualmente a barra', async () => {
    mount(<GoalDetails />, '/goals/detail/' + id);
    await screen.findByRole('heading', { name: goal.title });
    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.queryByRole('button', { name: 'Atualizar realizado' })).not.toBeInTheDocument();
  });
  it('não cria nomes ou contas de sócios no estado vazio', async () => {
    mount(<GoalTeamPage />);
    await screen.findByText('Nenhum administrador ativo neste recorte.');
    expect(screen.queryByText('Vinicius')).not.toBeInTheDocument();
  });
});
