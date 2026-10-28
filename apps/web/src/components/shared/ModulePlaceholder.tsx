import { Construction, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from './DashboardComponents';
export function ModulePlaceholder({ label }: { label: string }) {
  return (
    <section className="dashboard-page">
      <PageHeader title={label} description="Mais possibilidades para o seu workspace." />
      <Card className="module-placeholder">
        <span className="planned-badge">EM PLANEJAMENTO</span>
        <EmptyState
          icon={Construction}
          title={`${label}: próximo capítulo`}
          description="Este módulo ainda não está disponível. As funcionalidades e os dados serão integrados nas próximas etapas."
        />
        <Link to="/dashboard" className="text-link">
          <ArrowLeft size={16} />
          Voltar ao dashboard
        </Link>
      </Card>
    </section>
  );
}
