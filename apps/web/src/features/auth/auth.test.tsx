import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoginPage } from './AuthPages';
import { ProtectedRoute } from './ProtectedRoute';
import { authApi } from './auth-api';
import type { SessionView } from './AuthProvider';

const value = vi.hoisted(() => ({
  session: null as SessionView | null,
  loading: false,
  error: '',
  reload: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
}));
vi.mock('./AuthProvider', () => ({ useAuth: () => value }));
vi.mock('./auth-api', () => ({
  authApi: vi.fn(),
  authMessage: () => 'Credenciais ou rede inválidas.',
}));
beforeEach(() => {
  value.session = null;
  value.loading = false;
  value.error = '';
  vi.clearAllMocks();
});
afterEach(cleanup);
function routes(owner = false) {
  return render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route element={<ProtectedRoute owner={owner} />}>
          <Route path="/private" element={<h1>Painel privado</h1>} />
        </Route>
        <Route path="/login" element={<h1>Login obrigatório</h1>} />
        <Route path="/mfa" element={<h1>MFA obrigatório</h1>} />
        <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        <Route path="/recover/update" element={<h1>Alterar senha</h1>} />
        <Route path="/invitation" element={<h1>Aceitar convite</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('Rotas administrativas', () => {
  it('redireciona sessão ausente para login sem renderizar painel', () => {
    routes();
    expect(screen.getByRole('heading', { name: 'Login obrigatório' })).toBeInTheDocument();
    expect(screen.queryByText('Painel privado')).not.toBeInTheDocument();
  });
  it('aguarda a restauração antes de redirecionar', () => {
    value.loading = true;
    routes();
    expect(screen.getByRole('status')).toHaveTextContent('Restaurando');
  });
  it.each(['mfa_enroll', 'mfa_verify'] as const)('bloqueia %s antes do painel', (state) => {
    value.session = { state, email: 'admin@example.invalid', role: 'OWNER', factors: [] };
    routes();
    expect(screen.getByText('MFA obrigatório')).toBeInTheDocument();
  });
  it.each([
    ['password', 'Alterar senha'],
    ['invitation', 'Aceitar convite'],
  ] as const)('encaminha onboarding %s', (state, text) => {
    value.session = { state, email: 'admin@example.invalid', role: null, factors: [] };
    routes();
    expect(screen.getByText(text)).toBeInTheDocument();
  });
  it('permite sessão pronta e bloqueia ADMIN em rota OWNER', () => {
    value.session = { state: 'ready', email: 'admin@example.invalid', role: 'ADMIN', factors: [] };
    routes(true);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
  it('permite OWNER com MFA concluído', () => {
    value.session = { state: 'ready', email: 'admin@example.invalid', role: 'OWNER', factors: [] };
    routes(true);
    expect(screen.getByText('Painel privado')).toBeInTheDocument();
  });
});
describe('Login por sessão do backend', () => {
  it('envia credenciais ao backend e restaura estado sem persistir tokens', async () => {
    vi.mocked(authApi).mockResolvedValue({});
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('E-mail'), 'admin@example.invalid');
    await userEvent.type(screen.getByLabelText('Senha'), 'test-only-password');
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    await waitFor(() => expect(value.reload).toHaveBeenCalled());
    expect(authApi).toHaveBeenCalledWith('/auth/login', 'POST', {
      email: 'admin@example.invalid',
      password: 'test-only-password',
    });
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it('mostra falha sem liberar painel nem restaurar sessão', async () => {
    vi.mocked(authApi).mockRejectedValue(new Error('test-only failure'));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('E-mail'), 'admin@example.invalid');
    await userEvent.type(screen.getByLabelText('Senha'), 'wrong-test-password');
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais ou rede inválidas');
    expect(value.reload).not.toHaveBeenCalled();
  });
});
