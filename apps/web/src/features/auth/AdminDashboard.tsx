import { ShieldCheck, KeyRound, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from './AuthProvider';
export function AdminDashboard() {
  const { session } = useAuth();
  return (
    <section className="foundation-page">
      <div className="eyebrow">
        <span /> WORKSPACE ADMINISTRATIVO
      </div>
      <div className="page-heading">
        <div>
          <h1>
            Acesso seguro.
            <br />
            <span>Bem-vindo à VYMPA.</span>
          </h1>
          <p>{session?.email}</p>
        </div>
        <span className="pill">{session?.role}</span>
      </div>
      <div className="hero-panel">
        <div className="hero-grid" />
        <div className="hero-content">
          <ShieldCheck className="text-primary" size={32} />
          <h2>Sua identidade está confirmada.</h2>
          <p>
            Perfil administrativo ativo e autenticação em duas etapas concluída.
            <br />
            Os módulos comerciais serão disponibilizados nas próximas etapas.
          </p>
          <div className="hero-tags">
            <span>MFA verificado</span>
            <span>Sessão protegida</span>
            <span>Permissões verificadas pelo servidor</span>
          </div>
        </div>
      </div>
      <div className="architecture-cards mt-6">
        <Card>
          <CardHeader>
            <KeyRound className="text-primary" />
            <CardTitle>Conta individual</CardTitle>
          </CardHeader>
          <CardContent>
            Seu acesso é pessoal. Não compartilhe senhas nem códigos do autenticador.
          </CardContent>
        </Card>
        {session?.role === 'OWNER' && (
          <Card>
            <CardHeader>
              <UsersRound className="text-primary" />
              <CardTitle>Administradores</CardTitle>
            </CardHeader>
            <CardContent>
              <Link className="auth-link" to="/admin/users">
                Gerenciar equipe e convites →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
