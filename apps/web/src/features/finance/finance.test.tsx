import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offeringDefaults, provisionalRules } from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { FinanceHome } from './FinanceHome';
import { SimulatorPage } from './SimulatorPage';
const state = vi.hoisted(() => ({ role: 'OWNER' }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { role: state.role, email: 'fixture@example.invalid' } }),
}));
vi.mock('@/features/auth/auth-api', () => ({
  authApi: vi.fn(),
  authMessage: () => 'Falha de conexão.',
}));
const ownerId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  state.role = 'OWNER';
  vi.resetAllMocks();
  vi.mocked(authApi).mockImplementation(async (path) => {
    if (path === '/finance/catalog')
      return offeringDefaults.map((o, i) => ({
        ...o,
        id: String(i),
        active: true,
        baseCents: null,
        setupCents: null,
        monthlyCents: null,
        operatingCents: null,
        version: 1,
        priceHistory: [],
      })) as never;
    if (path === '/finance/discount-policy')
      return { id: 'default', rules: provisionalRules, provisional: true, version: 0 } as never;
    if (path.startsWith('/finance/simulations?')) return [] as never;
    if (path === '/prospecting/assignees')
      return [{ id: ownerId, email: 'fixture@example.invalid' }] as never;
    if (path.startsWith('/prospecting/leads?')) return { items: [] } as never;
    throw new Error('Unexpected fixture request');
  });
});
afterEach(cleanup);
function mount(component: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>{component}</MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Separação das áreas financeiras', () => {
  it('mostra dois cards independentes e suas rotas', () => {
    mount(<FinanceHome />);
    expect(
      screen.getByRole('heading', { name: 'Simulador de Propostas e Planos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gestão Financeira da VYMPA' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acompanhar o caixa' })).toHaveAttribute(
      'href',
      '/finance/management',
    );
  });
  it('ADMIN tem simulador mas não recebe link de acesso ao caixa', () => {
    state.role = 'ADMIN';
    mount(<FinanceHome />);
    expect(screen.getByText('Acesso exclusivo OWNER')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acompanhar o caixa' })).not.toBeInTheDocument();
  });
  it('não preenche custo do cliente com número fictício', async () => {
    mount(<SimulatorPage />);
    await screen.findByText('Nenhuma simulação salva.');
    expect(screen.getByLabelText('Custo mensal atual total (R$)')).toHaveValue('');
    expect(screen.getByText(/Margem não calculada/)).toBeInTheDocument();
    expect(vi.mocked(authApi).mock.calls.every(([, method]) => !method || method === 'GET')).toBe(
      true,
    );
  });
  it('recalcula o exemplo de dez mil instantaneamente sem persistir', async () => {
    mount(<SimulatorPage />);
    await userEvent.type(screen.getByLabelText('Custo mensal atual total (R$)'), '10000,00');
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText(/8\.600,00/)).toBeInTheDocument();
    expect(screen.getByText(/16\.800,00/)).toBeInTheDocument();
    expect(vi.mocked(authApi).mock.calls.some(([p]) => p === '/finance/simulations')).toBe(false);
  });
  it('ADMIN não vê exceções e edição de preços', async () => {
    state.role = 'ADMIN';
    mount(<SimulatorPage />);
    await screen.findByText('Nenhuma simulação salva.');
    expect(screen.queryByLabelText('Desconto manual (%)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar preços/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar política' })).not.toBeInTheDocument();
  });
  it('avisa sobre margem negativa e preserva sinal da economia', async () => {
    mount(<SimulatorPage />);
    await userEvent.type(screen.getByLabelText('Custo mensal atual total (R$)'), '10000');
    await userEvent.type(screen.getByLabelText('Infraestrutura mensal (R$)'), '9000');
    for (const label of [
      'APIs e IA mensais (R$)',
      'Manutenção mensal (R$)',
      'Suporte mensal (R$)',
      'Outros custos diretos mensais (R$)',
    ])
      await userEvent.type(screen.getByLabelText(label), '0');
    expect(screen.getByRole('alert')).toHaveTextContent('não cobre os custos');
    await userEvent.type(screen.getByLabelText('Mensalidade negociada (R$)'), '12000');
    expect(screen.getByText(/A proposta é mais cara/)).toBeInTheDocument();
  });
  it('salva entradas para recálculo no backend, sem enviar resultado confiável do cliente', async () => {
    const normal = vi.mocked(authApi).getMockImplementation()!;
    vi.mocked(authApi).mockImplementation(async (path, ...args) => {
      if (path === '/finance/simulations')
        return Promise.reject(
          Object.assign(new Error(), {
            isAxiosError: true,
            response: { status: 400, data: { message: 'fixture validation' } },
          }),
        );
      return normal(path, ...args);
    });
    mount(<SimulatorPage />);
    await userEvent.type(screen.getByLabelText('Empresa prospectada'), 'TESTE empresa');
    await userEvent.type(screen.getByLabelText('Custo mensal atual total (R$)'), '10000');
    await userEvent.selectOptions(screen.getByLabelText('Responsável'), ownerId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Sistema personalizado \+ IA/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() =>
      expect(authApi).toHaveBeenCalledWith(
        '/finance/simulations',
        'POST',
        expect.objectContaining({
          currentCostCents: 1000000,
          companyName: 'TESTE empresa',
          offeringCodes: ['CUSTOM_AI'],
        }),
      ),
    );
    const body = vi.mocked(authApi).mock.calls.find(([p]) => p === '/finance/simulations')?.[2];
    expect(body).not.toHaveProperty('result');
    expect(vi.mocked(authApi).mock.calls.some(([p]) => p.startsWith('/finance/management'))).toBe(
      false,
    );
  });
});
