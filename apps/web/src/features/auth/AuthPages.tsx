import { useState, type FormEvent, type PropsWithChildren } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ShieldCheck, Fingerprint, ArrowRight, Blocks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi, authMessage } from './auth-api';
import { useAuth } from './AuthProvider';
import { nextAuthPath } from './ProtectedRoute';

function AuthShell({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link to="/login" className="brand">
          <Blocks className="text-primary" /> VYMPA <small>CONNECT</small>
        </Link>
        <div>
          <span className="eyebrow">ACESSO PRIVADO · VYMPA</span>
          <h1>
            Uma plataforma.
            <br />
            <span>Responsabilidades claras.</span>
          </h1>
          <p>Contas individuais, autenticação em duas etapas e acesso conforme o seu papel.</p>
          <div className="auth-trust">
            <ShieldCheck /> Ambiente administrativo exclusivo
          </div>
        </div>
        <small>VYMPA Connect · Workspace interno</small>
      </section>
      <section className="auth-card">
        <Fingerprint className="text-primary mb-6" size={30} />
        <h2>{title}</h2>
        {children}
      </section>
    </main>
  );
}
export function LoginPage() {
  const { session, loading, error: sessionError, reload } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading)
    return (
      <AuthShell title="Restaurando sessão">
        <p role="status">Aguarde…</p>
      </AuthShell>
    );
  if (session) return <Navigate to={nextAuthPath(session.state)} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi('/auth/login', 'POST', { email, password });
      await reload();
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Entre no seu workspace">
      <p>Use o e-mail associado ao seu convite administrativo.</p>
      <form onSubmit={submit} className="auth-form">
        <label>
          E-mail
          <Input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Senha
          <Input
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Verificando…' : 'Continuar'} <ArrowRight size={16} />
        </Button>
      </form>
      <Link className="auth-link" to="/recover">
        Recuperar acesso
      </Link>
      <p className="auth-note">O acesso exige convite e autenticador. Não há cadastro público.</p>
    </AuthShell>
  );
}
export function RecoveryPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await authApi<{ message: string }>('/auth/recover', 'POST', { email });
      setMessage(response.message);
    } catch (failure) {
      setMessage(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Recuperar acesso">
      <p>Enviaremos as instruções para o e-mail da conta, caso esteja autorizada.</p>
      <form onSubmit={submit} className="auth-form">
        <label>
          E-mail
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar instruções'}
        </Button>
      </form>
      {message && <p role="status">{message}</p>}
      <Link className="auth-link" to="/login">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
export function ConfirmPage() {
  const [params] = useState(
    () => new URLSearchParams(window.location.hash.slice(1) || window.location.search),
  );
  const { reload } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    window.history.replaceState(null, '', '/auth/confirm');
    if (!tokenHash || !['invite', 'recovery'].includes(type ?? '')) {
      setError('Link inválido. Solicite novas instruções.');
      setBusy(false);
      return;
    }
    try {
      await authApi('/auth/confirm', 'POST', { tokenHash, type });
      await reload();
      navigate('/dashboard', { replace: true });
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Confirme seu acesso">
      <p>Continue para validar o link recebido por e-mail e configurar seu acesso seguro.</p>
      {error && <p role="alert">{error}</p>}
      <Button
        onClick={() => {
          void confirm();
        }}
        disabled={busy}
      >
        {busy ? 'Confirmando…' : 'Confirmar link'}
      </Button>
      <Link className="auth-link" to="/login">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
export function MfaPage() {
  const { session, loading, reload, logout } = useAuth();
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string } | null>(null);
  const [factor, setFactor] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (loading) return <p role="status">Restaurando sessão…</p>;
  if (!session) return <Navigate to="/login" replace />;
  if (!['mfa_enroll', 'mfa_verify'].includes(session.state))
    return <Navigate to={nextAuthPath(session.state)} replace />;
  const enrolling = session.state === 'mfa_enroll';
  async function enroll() {
    setBusy(true);
    setError('');
    try {
      setEnrollment(await authApi('/auth/mfa/enroll', 'POST'));
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi('/auth/mfa/verify', 'POST', {
        factorId: enrollment?.factorId ?? (factor || session?.factors[0]?.id),
        code,
      });
      setEnrollment(null);
      setCode('');
      await reload();
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
      setCode('');
    }
  }
  async function recovery() {
    setBusy(true);
    try {
      const value = await authApi<{ id: string; message: string }>('/auth/mfa/recovery', 'POST');
      setNotice(value.message + ' Protocolo: ' + value.id);
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell title={enrolling ? 'Configure seu autenticador' : 'Verifique sua identidade'}>
      <p>
        {enrolling
          ? 'Cadastre o QR Code em um aplicativo como Google Authenticator ou 1Password. Confirme o código para continuar.'
          : 'Digite o código de seis dígitos do seu autenticador.'}
      </p>
      {enrolling && !enrollment && (
        <Button
          onClick={() => {
            void enroll();
          }}
          disabled={busy}
        >
          Gerar QR Code
        </Button>
      )}
      {enrollment && (
        <img
          className="mfa-qr"
          src={enrollment.qrCode}
          alt="QR Code para cadastrar o autenticador VYMPA"
        />
      )}
      {(!enrolling || enrollment) && (
        <form onSubmit={verify} className="auth-form">
          {session.factors.length > 1 && (
            <label>
              Autenticador
              <select
                value={factor || session.factors[0]?.id}
                onChange={(e) => setFactor(e.target.value)}
              >
                {session.factors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Código do autenticador
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Verificando…' : 'Validar e continuar'}
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!enrolling && (
        <Button
          className="mt-4"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void recovery();
          }}
        >
          Perdi o autenticador
        </Button>
      )}
      <Button
        className="mt-4"
        variant="outline"
        disabled={busy}
        onClick={() => {
          void logout();
        }}
      >
        Sair
      </Button>
    </AuthShell>
  );
}
export function CompleteAccessPage({ invitation = false }: { invitation?: boolean }) {
  const { session, loading, reload, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading) return <p role="status">Restaurando sessão…</p>;
  if (!session) return <Navigate to="/login" replace />;
  if (session.state !== (invitation ? 'invitation' : 'password'))
    return <Navigate to={nextAuthPath(session.state)} replace />;
  async function complete(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!invitation && password !== confirmation) {
      setError('As senhas devem coincidir.');
      return;
    }
    setBusy(true);
    try {
      await authApi(
        invitation ? '/auth/invitation/accept' : '/auth/password',
        'POST',
        invitation ? {} : { password },
      );
      await reload();
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setPassword('');
      setConfirmation('');
      setBusy(false);
    }
  }
  return (
    <AuthShell title={invitation ? 'Aceitar convite administrativo' : 'Defina sua nova senha'}>
      <p>
        {invitation
          ? 'Sua identidade e MFA foram confirmados. Aceite o convite para ativar seu perfil ADMIN.'
          : 'Use uma senha exclusiva com pelo menos 12 caracteres.'}
      </p>
      <form onSubmit={complete} className="auth-form">
        {!invitation && (
          <>
            <label>
              Nova senha
              <Input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirme a senha
              <Input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : invitation ? 'Aceitar convite' : 'Salvar nova senha'}
        </Button>
      </form>
      <Button
        variant="ghost"
        onClick={() => {
          void logout();
        }}
      >
        Sair
      </Button>
    </AuthShell>
  );
}
