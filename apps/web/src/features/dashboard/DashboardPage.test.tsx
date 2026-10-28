import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { authApi } from '@/features/auth/auth-api';
import { DashboardPage } from './DashboardPage';
import type { DashboardSummary } from '@vympa/shared';
vi.mock('@/features/auth/auth-api', () => ({ authApi: vi.fn() }));
const summary: DashboardSummary = {
  generatedAt: '2026-10-28T12:00:00Z',
  businessStatus: 'modules_pending',
  metrics: {
    leads: null,
    negotiations: null,
    closedContracts: null,
    activeClients: null,
    monthlyRevenue: null,
    monthlyExpenses: null,
    balance: null,
    goalProgress: null,
  },
  finance: [],
  commercial: [],
  funnel: [],
  contracts: [],
  goals: [],
  activities: [],
};
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Dashboard operacional sem dados inventados', () => {
  it('diferencia indicadores indisponíveis de zero e mostra estados vazios', async () => {
    vi.mocked(authApi).mockResolvedValue(summary);
    mount();
    expect(await screen.findByText('Ainda não existem dados financeiros')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/: indisponível/)).toHaveLength(8);
    expect(screen.getByText('Nenhum contrato cadastrado')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma atividade registrada')).toBeInTheDocument();
    expect(screen.queryByText('R$ 0')).not.toBeInTheDocument();
  });
  it('mostra carregamento sem exibir dados vazios prematuramente', () => {
    vi.mocked(authApi).mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando seu resumo');
    expect(screen.queryByText('Nenhum contrato cadastrado')).not.toBeInTheDocument();
  });
  it('mostra falha e permite tentar novamente', async () => {
    vi.mocked(authApi).mockRejectedValueOnce(new Error('failure')).mockResolvedValue(summary);
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.queryByText('Nenhuma atividade registrada')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Nenhuma atividade registrada')).toBeInTheDocument();
  });
  it('renderiza somente as atividades entregues pela API', async () => {
    vi.mocked(authApi).mockResolvedValue({
      ...summary,
      activities: [
        { id: 'test-event', label: 'Autenticador verificado', occurredAt: summary.generatedAt },
      ],
    });
    mount();
    expect(await screen.findByText('Autenticador verificado')).toBeInTheDocument();
  });
});
