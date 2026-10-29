import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  Activity,
  ArrowRight,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  FileCheck2,
  Flag,
  Handshake,
  ListFilter,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  LineChart,
  Line,
} from 'recharts';
import type { DashboardSummary, DashboardMetric } from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { Button } from '@/components/ui/button';
import { VympaLogo } from '@/components/shared/VympaLogo';
import { Metric, money } from '@/features/clients/commercial-ui';
import {
  ChartContainer,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingState,
  PageHeader,
} from '@/components/shared/DashboardComponents';

const indicators = [
  ['leads', 'Leads cadastrados', Users, '/prospecting', 'number'],
  ['negotiations', 'Leads em negociação', Handshake, '/crm', 'number'],
  ['closedContracts', 'Contratos ativos', FileCheck2, '/contracts', 'number'],
  ['activeClients', 'Clientes ativos', Users, '/clients', 'number'],
  ['monthlyRevenue', 'Receitas recebidas no mês', TrendingUp, '/finance', 'currency'],
  ['monthlyExpenses', 'Despesas mensais', Wallet, '/finance', 'currency'],
  ['balance', 'Saldo financeiro', CircleDollarSign, '/finance', 'currency'],
  ['goalProgress', 'Alcance médio das metas comerciais do mês', Flag, '/goals', 'percent'],
] as const satisfies readonly (readonly [
  DashboardMetric,
  string,
  typeof Users,
  string,
  'number' | 'currency' | 'percent',
])[];

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => authApi<DashboardSummary>('/dashboard/summary'),
    retry: false,
  });
  const data = query.data;
  return (
    <section className="dashboard-page">
      <PageHeader
        title="Visão geral"
        description="Tudo o que importa para o próximo passo da VYMPA."
      >
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          <RefreshCw size={15} className={query.isFetching ? 'spin' : ''} />
          Atualizar
        </Button>
      </PageHeader>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError || !data ? (
        <ErrorState
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          {data.goalIndicators && (
            <div className="finance-metrics">
              <Metric label="Metas ativas" value={data.goalIndicators.active} />
              <Metric label="Metas alcançadas" value={data.goalIndicators.achieved} />
              <Metric label="Metas próximas do prazo" value={data.goalIndicators.expiring} />
              {data.goalIndicators.financialInProgress !== null && (
                <Metric
                  label="Objetivos financeiros em andamento"
                  value={data.goalIndicators.financialInProgress}
                />
              )}
            </div>
          )}
          {data.relationships && (
            <div className="finance-metrics">
              <Metric label="Total de clientes" value={data.relationships.totalClients} />
              <Metric label="Clientes em implantação" value={data.relationships.onboarding} />
              <Metric
                label="Contratos próximos do vencimento"
                value={data.relationships.expiring}
              />
              <Metric label="Aguardando assinatura" value={data.relationships.pendingSignature} />
              {data.relationships.monthlyContractedCents !== null && (
                <Metric
                  label="Valor mensal contratado · separado do caixa"
                  value={money(Number(data.relationships.monthlyContractedCents))}
                />
              )}
            </div>
          )}
          <div className="dashboard-welcome">
            <div>
              <span className="welcome-icon">
                <VympaLogo />
              </span>
              <div>
                <span className="eyebrow">UM NOVO PONTO DE PARTIDA</span>
                <h2>Seu negócio, em perspectiva.</h2>
                <p>Os próximos módulos vão transformar seus dados em decisões.</p>
              </div>
            </div>
            <span className="welcome-status">
              <span className="status-dot" />
              Workspace em construção
            </span>
          </div>
          <div className="dashboard-section-title">
            <h2>Panorama do negócio</h2>
            <span>Resumo disponível conforme os módulos forem ativados</span>
          </div>
          <div className="kpi-grid">
            {indicators.map(([key, label, icon, href, format]) => (
              <KpiCard
                key={key}
                label={label}
                value={data.metrics[key]}
                icon={icon}
                href={href}
                format={format}
              />
            ))}
          </div>
          {data.prospecting && (
            <div className="kpi-grid mt-4">
              <KpiCard
                label="Leads em contato"
                value={data.prospecting.contacted}
                icon={Handshake}
                href="/crm"
              />
              <KpiCard
                label="Negociações ganhas"
                value={data.prospecting.won}
                icon={FileCheck2}
                href="/crm"
              />
              <KpiCard
                label="Negociações perdidas"
                value={data.prospecting.lost}
                icon={Flag}
                href="/crm"
              />
            </div>
          )}
          <p className="data-note">
            <span className="cyan-dot" />
            Indicadores indisponíveis aparecem como “—”. Nenhum resultado comercial foi estimado.
          </p>
          <div className="dashboard-charts">
            <ChartContainer
              title="Receita e despesas"
              subtitle="Acompanhe o equilíbrio financeiro"
              link="/finance"
            >
              <div className="chart-legend">
                <span>
                  <i />
                  Receita
                </span>
                <span>
                  <i />
                  Despesas
                </span>
              </div>
              {data.finance.length ? (
                <div className="chart-plot" role="img" aria-label="Gráfico de receita e despesas">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.finance}>
                      <CartesianGrid stroke="#20303e" vertical={false} />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Receita"
                        stroke="#68dda8"
                        fill="#68dda822"
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Despesas"
                        stroke="#64cbdf"
                        fill="#64cbdf11"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  icon={ChartNoAxesCombined}
                  title="Ainda não existem dados financeiros"
                  description="Dados financeiros realizados aparecem para OWNER quando disponíveis."
                />
              )}
            </ChartContainer>
            <ChartContainer
              title="Evolução comercial"
              subtitle="Do primeiro contato à oportunidade"
              link="/crm"
            >
              {data.commercial.length ? (
                <div className="chart-plot" role="img" aria-label="Gráfico de evolução comercial">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.commercial}>
                      <CartesianGrid stroke="#20303e" vertical={false} />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip />
                      <Line dataKey="leads" name="Leads" stroke="#68dda8" />
                      <Line dataKey="negotiations" name="Negociações" stroke="#64cbdf" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title={
                    data.prospecting?.total
                      ? 'Evolução por período em preparação'
                      : 'Nenhuma negociação registrada'
                  }
                  description={
                    data.prospecting?.total
                      ? 'Os indicadores atuais estão disponíveis. A série histórica será integrada a este gráfico.'
                      : 'A evolução dos leads e das negociações será exibida com os dados dos módulos comerciais.'
                  }
                />
              )}
            </ChartContainer>
          </div>
          <div className="dashboard-bottom-grid">
            <ChartContainer
              title="Funil de prospecção"
              subtitle="O caminho das suas oportunidades"
              link="/prospecting"
            >
              {data.funnel.length ? (
                <ul className="dashboard-list">
                  {data.funnel.map((stage) => (
                    <li key={stage.label}>
                      <span>{stage.label}</span>
                      <strong>{stage.count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={ListFilter}
                  title="Seu funil começa aqui"
                  description="Nenhum lead cadastrado. O funil estará disponível com o módulo de Prospecção."
                  href="/prospecting"
                  action="Ver Prospecção"
                />
              )}
            </ChartContainer>
            <ChartContainer
              title="Atividades recentes"
              subtitle="Acessos da conta e atividades comerciais reais"
            >
              {data.activities.length ? (
                <ol className="activity-list">
                  {data.activities.map((event) => (
                    <li key={event.id}>
                      <span className="activity-dot">
                        <ShieldCheck size={15} />
                      </span>
                      <div>
                        <p>{event.label}</p>
                        <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  icon={Activity}
                  title="Nenhuma atividade registrada"
                  description="Os eventos de acesso da sua conta aparecerão aqui."
                />
              )}
            </ChartContainer>
            <div className="dashboard-agenda">
              <ChartContainer
                title="Próximos vencimentos"
                subtitle="Contratos no seu radar"
                link="/contracts"
              >
                {data.contracts.length ? (
                  <ul className="dashboard-list">
                    {data.contracts.map((contract) => (
                      <li key={contract.id}>
                        <span>{contract.name}</span>
                        <time dateTime={contract.dueAt}>{dateTime(contract.dueAt)}</time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={CalendarClock}
                    title="Nenhum contrato cadastrado"
                    description="Os vencimentos aparecerão após a ativação de Contratos."
                  />
                )}
              </ChartContainer>
              <ChartContainer
                title="Metas próximas do prazo"
                subtitle="Foco no que vem a seguir"
                link="/goals"
              >
                {data.goals.length ? (
                  <ul className="dashboard-list">
                    {data.goals.map((goal) => (
                      <li key={goal.id}>
                        <span>{goal.name}</span>
                        <time dateTime={goal.dueAt}>{dateTime(goal.dueAt)}</time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={Flag}
                    title="Nenhuma meta definida"
                    description="Acompanhe seus objetivos quando o módulo Metas estiver disponível."
                  />
                )}
              </ChartContainer>
            </div>
          </div>
          <div className="dashboard-footnote">
            <span>
              <ShieldCheck size={15} />
              Acesso privado · Dados da sua conta protegidos
            </span>
            <span>Consultado em {dateTime(data.generatedAt)}</span>
          </div>
          <Link to="/settings" className="dashboard-settings-link">
            Conheça seu workspace <ArrowRight size={14} />
          </Link>
        </>
      )}
    </section>
  );
}
