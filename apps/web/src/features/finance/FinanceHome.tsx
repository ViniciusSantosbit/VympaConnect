import { Calculator, Wallet, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/shared/DashboardComponents';
import { useAuth } from '@/features/auth/AuthProvider';
import './finance.css';
export function FinanceHome() {
  const { session } = useAuth();
  return (
    <section className="dashboard-page finance-page">
      <PageHeader
        title="Financeiro"
        description="Planeje propostas comerciais e acompanhe as finanças reais da VYMPA em ambientes independentes."
      />
      <div className="finance-home-grid">
        <Link className="finance-entry-card" to="/finance/simulator">
          <span className="finance-entry-icon">
            <Calculator size={32} />
          </span>
          <span className="eyebrow">ESTRATÉGIA COMERCIAL</span>
          <h2>Simulador de Propostas e Planos</h2>
          <p>
            Construa propostas comerciais personalizadas, compare custos e apresente a economia
            potencial das soluções VYMPA.
          </p>
          <strong>
            Construir uma proposta <ArrowUpRight size={18} />
          </strong>
          <small>
            Simulações, catálogo, descontos e histórico. Nenhuma receita é gerada automaticamente.
          </small>
        </Link>
        <article className="finance-entry-card finance-entry-private">
          <span className="finance-entry-icon">
            <Wallet size={32} />
          </span>
          <span className="eyebrow">FINANÇAS DA EMPRESA</span>
          <h2>Gestão Financeira da VYMPA</h2>
          <p>
            Controle receitas, despesas, investimentos e custos operacionais da empresa em um único
            ambiente.
          </p>
          {session?.role === 'OWNER' ? (
            <Link to="/finance/management">
              Acompanhar o caixa <ArrowUpRight size={18} />
            </Link>
          ) : (
            <strong>
              <LockKeyhole size={16} /> Acesso exclusivo OWNER
            </strong>
          )}
          <small>Somente recebimentos e pagamentos realizados compõem o caixa.</small>
        </article>
      </div>
    </section>
  );
}
