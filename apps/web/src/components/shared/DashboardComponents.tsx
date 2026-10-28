import type { ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="dashboard-heading">
      <div>
        <span className="eyebrow">VYMPA CONNECT / WORKSPACE</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function RoleBadge({ role }: { role: 'OWNER' | 'ADMIN' | null }) {
  return <span className="role-badge">{role ?? 'Sem papel'}</span>;
}
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  href,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={23} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && (
        <Link className="text-link" to={href}>
          {action ?? 'Conhecer módulo'}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="dashboard-loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>Carregando seu resumo…</span>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} />
        ))}
      </div>
    </div>
  );
}
export function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="dashboard-error" role="alert">
      <AlertCircle size={24} />
      <h2>Não foi possível carregar o dashboard</h2>
      <p>Confira sua conexão e tente novamente. Os indicadores não foram carregados.</p>
      <Button variant="outline" onClick={retry}>
        Tentar novamente
      </Button>
    </div>
  );
}
export function KpiCard({
  label,
  value,
  icon: Icon,
  format = 'number',
  href,
}: {
  label: string;
  value: number | null;
  icon: LucideIcon;
  format?: 'number' | 'currency' | 'percent';
  href: string;
}) {
  const display =
    value === null
      ? '—'
      : format === 'currency'
        ? new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 0,
          }).format(value)
        : format === 'percent'
          ? `${value}%`
          : new Intl.NumberFormat('pt-BR').format(value);
  return (
    <Card className="kpi-card">
      <div className="kpi-top">
        <span>{label}</span>
        <Icon size={18} strokeWidth={1.6} />
      </div>
      <strong aria-label={value === null ? `${label}: indisponível` : `${label}: ${display}`}>
        {display}
      </strong>
      <div className="kpi-bottom">
        <span>{value === null ? 'Aguardando módulo' : 'Dados do período'}</span>
        <Link to={href} aria-label={`Abrir ${label}`}>
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </Card>
  );
}
export function ChartContainer({
  title,
  subtitle,
  children,
  className = '',
  link,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  link?: string;
}) {
  return (
    <Card className={`dashboard-panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {link && (
          <Link className="panel-link" to={link} aria-label={`Abrir ${title}`}>
            <ArrowUpRight size={18} />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
