import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { authApi } from '@/features/auth/auth-api';
import { ClientsPage, ClientDetails } from './ClientsPage';
import { ContractsPage, ContractDetails } from './ContractsPage';
import type { ReactNode } from 'react';
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
const client = {
  id,
  companyName: 'Empresa de teste',
  segment: 'ADVOCACIA',
  status: 'PROSPECT',
  responsibleId: actor,
  responsible: { id: actor, email: 'owner@example.invalid' },
  version: 1,
  createdAt: '2026-10-29',
  contacts: [],
  services: [],
  leads: [],
};
const contract = {
  id,
  number: 'C-001',
  title: 'Sistema com IA',
  clientId: id,
  client: { id, companyName: client.companyName },
  responsibleId: actor,
  responsible: client.responsible,
  requestKey: 'request-01',
  status: 'DRAFT',
  effectiveStatus: 'DRAFT',
  billingPeriod: 'MONTHLY',
  version: 1,
  services: [],
  history: [],
  setupCents: 10000,
  monthlyCents: 20000,
  currentMonthlyCents: 20000,
};
beforeEach(() => {
  contract.status = 'DRAFT';
  contract.effectiveStatus = 'DRAFT';
  state.role = 'OWNER';
  vi.resetAllMocks();
  vi.mocked(authApi).mockImplementation(async (path, method) => {
    if (path === '/prospecting/assignees')
      return [{ id: actor, email: 'owner@example.invalid' }] as never;
    if (path === '/contracts/summary')
      return {
        totalClients: 1,
        activeClients: 0,
        onboarding: 0,
        active: 0,
        expired: 0,
        pendingSignature: 0,
        expiring: 0,
        renewals: 0,
        monthlyContractedCents: '0',
        unpriced: 0,
      } as never;
    if (path.startsWith('/clients?'))
      return { items: [client], total: 1, page: 1, pageSize: 30 } as never;
    if (path === '/clients/' + id) return client as never;
    if (path.startsWith('/contracts?'))
      return { items: [], total: 0, page: 1, pageSize: 30 } as never;
    if (path.startsWith('/contracts/expiring?')) return [] as never;
    if (path === '/contracts/' + id) return contract as never;
    if (path.endsWith('/documents'))
      return { pending: 'Armazenamento privado pendente.', items: [] } as never;
    if (path === '/finance/management/categories')
      return [{ id: actor, name: 'Serviços', active: true }] as never;
    if (path === '/finance/management/transactions' && method === 'POST')
      return { id: 'entry' } as never;
    if (path === '/clients' && method === 'POST') return client as never;
    throw new Error('Unexpected fixture ' + path);
  });
});
afterEach(cleanup);
function mount(element: ReactNode, path = '/clients') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/clients" element={element} />
          <Route path="/clients/:id" element={element} />
          <Route path="/contracts" element={element} />
          <Route path="/contracts/:id" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Clientes e contratos', () => {
  it('OWNER cria cobrança somente após revisão e sempre como pendente', async () => {
    contract.status = 'ACTIVE';
    contract.effectiveStatus = 'ACTIVE';
    mount(<ContractDetails />, '/contracts/' + id);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Registrar cobrança prevista' }),
    );
    await screen.findByRole('heading', { name: 'Registrar cobrança prevista' });
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), actor);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(authApi).toHaveBeenCalledWith(
        '/finance/management/transactions',
        'POST',
        expect.objectContaining({
          clientId: id,
          contractId: id,
          status: 'PENDING',
          type: 'INCOME',
          amountCents: 20000,
        }),
      ),
    );
  });
  it('lista empresas reais da API e filtra pela pesquisa', async () => {
    mount(<ClientsPage />);
    expect(await screen.findByRole('link', { name: /Empresa de teste/ })).toHaveAttribute(
      'href',
      '/clients/' + id,
    );
    await userEvent.type(screen.getByLabelText('Pesquisar clientes'), 'Teste');
    await waitFor(() =>
      expect(vi.mocked(authApi).mock.calls.some(([p]) => p.includes('query=Teste'))).toBe(true),
    );
  });
  it('cadastra com campos mínimos e não envia CNPJ vazio', async () => {
    mount(<ClientsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Novo cliente/ }));
    await userEvent.type(screen.getByLabelText('Nome empresarial'), 'Nova empresa');
    await userEvent.selectOptions(screen.getByLabelText('Segmento'), 'ADVOCACIA');
    await userEvent.selectOptions(screen.getByLabelText('Responsável interno'), actor);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(authApi).toHaveBeenCalledWith('/clients', 'POST', {
        companyName: 'Nova empresa',
        segment: 'ADVOCACIA',
        responsibleId: actor,
      }),
    );
  });
  it('mostra estado vazio de contatos e abre cadastro profissional', async () => {
    mount(<ClientDetails />, '/clients/' + id);
    await screen.findByRole('heading', { name: client.companyName });
    await userEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    expect(screen.getByText('Nenhum contato cadastrado.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar contato' }));
    expect(
      screen.getByText('Registre apenas dados profissionais necessários ao relacionamento.'),
    ).toBeInTheDocument();
  });
  it('ADMIN não recebe aba financeira nem ação de status do cliente', async () => {
    state.role = 'ADMIN';
    mount(<ClientDetails />, '/clients/' + id);
    await screen.findByRole('heading', { name: client.companyName });
    expect(screen.queryByRole('button', { name: 'Financeiro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alterar status' })).not.toBeInTheDocument();
  });
  it('lista contratos vazios e permite escolher a antecedência', async () => {
    mount(<ContractsPage />, '/contracts');
    await screen.findByRole('heading', { name: 'Contratos e Vigências' });
    await userEvent.selectOptions(screen.getByLabelText('Antecedência'), '7');
    await waitFor(() => expect(authApi).toHaveBeenCalledWith('/contracts/expiring?days=7'));
    expect(screen.getByText(/Contratos assinados não representam pagamentos/)).toBeInTheDocument();
  });
  it('ADMIN não visualiza valores e não formaliza nem reajusta contratos', async () => {
    state.role = 'ADMIN';
    mount(<ContractDetails />, '/contracts/' + id);
    await screen.findByRole('heading', { name: 'C-001 · Sistema com IA' });
    expect(screen.queryByText('Mensalidade atual')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alterar status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload indisponível' })).toBeDisabled();
  });
});
