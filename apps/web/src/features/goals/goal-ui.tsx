import { Link } from 'react-router';
import { goalMetricDefinitions, type GoalProgress } from '@vympa/shared';
import { Button } from '@/components/ui/button';
export const goalNames: Record<string, string> = {
  COMMERCIAL: 'Comerciais',
  FINANCIAL: 'Financeiras',
  TEAM: 'Por sócio',
  NOT_STARTED: 'Não iniciada',
  IN_PROGRESS: 'Em andamento',
  ACHIEVED: 'Alcançada',
  AT_RISK: 'Em risco',
  OVERDUE: 'Atrasada',
  CANCELLED: 'Cancelada',
  AUTO: 'Automática',
  MANUAL: 'Manual',
  GROWTH: 'Crescimento',
  LIMIT: 'Limite de despesas',
  REDUCTION: 'Redução de custos',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  COMPANY: 'Toda a empresa',
  ASSIGNED: 'Atividades dos responsáveis',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
  CUSTOM: 'Personalizada',
};
export const goalLabel = (code: string) =>
  goalMetricDefinitions.find((m) => m.code === code)?.label ?? code;
export const formatGoalValue = (value: string | null | undefined, unit: string) =>
  value == null
    ? 'Indisponível'
    : unit === 'CENTS'
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          Number(value) / 100,
        )
      : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(value)) +
        (unit === 'PERCENT' ? '%' : '');
export const humanDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
export function GoalNav() {
  return (
    <nav className="finance-back" aria-label="Navegação de metas">
      <Link to="/goals">Central de Metas</Link>
      <Link to="/goals/commercial">Comerciais</Link>
      <Link to="/goals/financial">Financeiras</Link>
      <Link to="/goals/team">Por sócio</Link>
      <Link to="/goals/analytics">Indicadores</Link>
    </nav>
  );
}
export function GoalBadge({ status }: { status: string }) {
  return <span className={'goal-badge goal-' + status}>{goalNames[status] ?? status}</span>;
}
export function GoalProgressBar({ p }: { p: GoalProgress }) {
  return (
    <div className="goal-progress">
      <div className="goal-progress-caption">
        <span>{p.phase}</span>
        <strong>
          {p.percent === null
            ? 'Sem percentual'
            : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(p.percent) + '%'}
        </strong>
      </div>
      <div
        className="goal-progress-track"
        role="progressbar"
        aria-label={p.phase}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.barPercent}
      >
        <span style={{ width: p.barPercent + '%' }} />
      </div>
    </div>
  );
}
export function GoalPager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <nav className="finance-actions" aria-label="Paginação de metas">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span>
        Página {page} · {total} metas
      </span>
      <Button variant="outline" disabled={page * 30 >= total} onClick={() => onPage(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}
