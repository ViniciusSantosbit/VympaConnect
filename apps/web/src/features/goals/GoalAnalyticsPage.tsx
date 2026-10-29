import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { goalMetricDefinitions, type GoalView } from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { useAuth } from '@/features/auth/AuthProvider';
import { PageHeader, LoadingState } from '@/components/shared/DashboardComponents';
import { Button } from '@/components/ui/button';
import { FinancePanel, FinanceError, today } from '@/features/finance/finance-ui';
import { GoalEditor } from './GoalEditor';
import { GoalNav, GoalBadge, GoalProgressBar, goalLabel, formatGoalValue } from './goal-ui';
import '@/features/finance/finance.css';
import './goals.css';
type Indicator = {
  code: string;
  value: string | null;
  source: string;
  reason: string | null;
  updatedAt: string;
};
type Analytics = {
  generatedAt: string;
  startsOn: string;
  endsOn: string;
  indicators: Indicator[];
  series: { period: string; partial: boolean; values: Indicator[] }[];
  stages: { status: string; count: number }[];
  segments: { segment: string; count: number }[];
  portfolioSource: string;
  contracts: { status: string; count: number }[];
  expiring: number;
  renewals: number;
  timeToFirstContact: { hours: string | null; samples: string; source: string };
  revenueBySegment: { segment: string; value: string | null }[];
  financialNote: string;
  comparison?: {
    code: string;
    current: string | null;
    previous: string | null;
    change: string | null;
  }[];
};
const stageNames: Record<string, string> = {
  NOT_CONTACTED: 'Sem contato',
  CONTACTED: 'Contatados',
  NEGOTIATING: 'Em negociação',
  WON: 'Ganhos',
  LOST: 'Perdidos',
  ADVOCACIA: 'Advocacia',
  CONTABILIDADE: 'Contabilidade',
  IMOBILIARIO: 'Imobiliário',
  ACTIVE: 'Ativos',
  DRAFT: 'Rascunhos',
  SIGNED: 'Assinados',
  PENDING_SIGNATURE: 'Aguardando assinatura',
  TERMINATED: 'Encerrados',
  CANCELLED: 'Cancelados',
  EXPIRED: 'Vencidos',
};
function useAnalysisFilters() {
  const [startsOn, setStart] = useState(today().slice(0, 7) + '-01'),
    [endsOn, setEnd] = useState(today()),
    [segment, setSegment] = useState(''),
    [responsibleId, setResponsible] = useState(''),
    [metric, setMetric] = useState('');
  const { session } = useAuth();
  const users = useQuery({
    queryKey: ['assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
  });
  const query = new URLSearchParams({
    startsOn,
    endsOn,
    ...(segment ? { segment } : {}),
    ...(responsibleId ? { responsibleId } : {}),
    ...(metric ? { metric } : {}),
  }).toString();
  return {
    query,
    filters: (
      <div className="goal-filters">
        <label>
          Data inicial
          <input type="date" value={startsOn} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Data final
          <input
            type="date"
            max={today()}
            value={endsOn}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          Segmento
          <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(stageNames)
              .filter(([k]) => ['ADVOCACIA', 'CONTABILIDADE', 'IMOBILIARIO'].includes(k))
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        {session?.role === 'OWNER' && (
          <label>
            Responsável
            <select value={responsibleId} onChange={(e) => setResponsible(e.target.value)}>
              <option value="">Toda a empresa</option>
              {users.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Indicador
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="">Todos</option>
            {goalMetricDefinitions
              .filter((d) => session?.role === 'OWNER' || !d.financial)
              .map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
          </select>
        </label>
      </div>
    ),
  };
}
export function GoalAnalyticsPage() {
  const filters = useAnalysisFilters();
  const q = useQuery({
    queryKey: ['goals', 'analytics', filters.query],
    queryFn: () => authApi<Analytics>('/goals/analytics?' + filters.query),
    retry: false,
  });
  const series =
    q.data?.series.map((p) => ({
      period: p.period + (p.partial ? ' (parcial)' : ''),
      leads: Number(p.values.find((v) => v.code === 'NEW_LEADS')?.value ?? 0),
      contatos: Number(p.values.find((v) => v.code === 'CONTACTED_LEADS')?.value ?? 0),
      propostas: Number(p.values.find((v) => v.code === 'SENT_PROPOSALS')?.value ?? 0),
      recebido:
        p.values.find((v) => v.code === 'RECEIVED_INCOME')?.value == null
          ? null
          : Number(p.values.find((v) => v.code === 'RECEIVED_INCOME')!.value) / 100,
      pago:
        p.values.find((v) => v.code === 'PAID_EXPENSES')?.value == null
          ? null
          : Number(p.values.find((v) => v.code === 'PAID_EXPENSES')!.value) / 100,
      selecionado: p.values[0]?.value == null ? null : Number(p.values[0]!.value),
    })) ?? [];
  return (
    <section className="dashboard-page finance-page goals-page">
      <GoalNav />
      <PageHeader
        title="Indicadores Estratégicos"
        description="Fontes reais, datas de corte e evolução comercial, financeira e contratual."
      />
      {filters.filters}
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <FinanceError error={q.error} />
      ) : (
        <>
          <p className="goal-source">
            Atualizado em {new Date(q.data.generatedAt).toLocaleString('pt-BR')}. Valores ausentes
            são apresentados como indisponíveis.
          </p>
          <div className="goal-indicators">
            {q.data.indicators.map((v) => {
              const def = goalMetricDefinitions.find((d) => d.code === v.code)!;
              return (
                <article key={v.code}>
                  <h2>{def.label}</h2>
                  <strong>{formatGoalValue(v.value, def.unit)}</strong>
                  <p className="goal-source">{v.source}</p>
                  {v.reason && <p className="goal-notice">{v.reason}</p>}
                </article>
              );
            })}
          </div>
          <div className="goal-chart-grid">
            <FinancePanel title="Evolução comercial">
              <div className="goal-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={series}>
                    <CartesianGrid stroke="#203144" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {q.data.series[0]?.values.length === 1 ? (
                      <Line
                        dataKey="selecionado"
                        name="Indicador selecionado"
                        stroke="#68dda8"
                        connectNulls={false}
                      />
                    ) : (
                      <>
                        <Line dataKey="leads" stroke="#68dda8" />
                        <Line dataKey="contatos" stroke="#52cdeb" />
                        <Line dataKey="propostas" stroke="#beadff" />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </FinancePanel>
            <FinancePanel title="Caixa recebido e despesas pagas (R$)">
              <div className="goal-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={series}>
                    <CartesianGrid stroke="#203144" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="recebido" name="Recebido" fill="#68dda8" />
                    <Bar dataKey="pago" name="Pago" fill="#52cdeb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="goal-source">{q.data.financialNote}</p>
            </FinancePanel>
          </div>
          <div className="goal-chart-grid">
            <FinancePanel title="Estágios atuais da carteira">
              <p className="goal-source">{q.data.portfolioSource}</p>
              <div className="goal-funnel">
                {q.data.stages.map((s) => (
                  <div key={s.status}>
                    <span>{stageNames[s.status] ?? s.status}</span>
                    <div
                      style={{
                        width:
                          Math.max(
                            1,
                            (s.count / Math.max(1, ...q.data.stages.map((s) => s.count))) * 100,
                          ) + '%',
                      }}
                    >
                      {s.count}
                    </div>
                  </div>
                ))}
              </div>
              {!q.data.stages.length && <p>Nenhum lead cadastrado neste recorte.</p>}
            </FinancePanel>
            <FinancePanel title="Leads por segmento">
              <div className="goal-chart">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={q.data.segments.map((s) => ({ ...s, name: stageNames[s.segment] }))}
                  >
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Leads" fill="#68dda8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </FinancePanel>
          </div>
          <FinancePanel title="Receita recebida por segmento">
            <div className="goal-indicators">
              {q.data.revenueBySegment.map((s) => (
                <article key={s.segment}>
                  <h3>{stageNames[s.segment]}</h3>
                  <strong>{formatGoalValue(s.value, 'CENTS')}</strong>
                </article>
              ))}
            </div>
            <p className="goal-source">
              Somente lançamentos com vínculo empresarial. Transações sem segmento não são
              distribuídas artificialmente.
            </p>
          </FinancePanel>
          <FinancePanel title="Relacionamento e contratos">
            <p>
              Tempo médio até o primeiro contato:{' '}
              {q.data.timeToFirstContact.hours ?? 'Indisponível'}{' '}
              {q.data.timeToFirstContact.hours ? 'horas' : ''} · {q.data.timeToFirstContact.samples}{' '}
              observações.
            </p>
            <p className="goal-source">{q.data.timeToFirstContact.source}</p>
            <div className="goal-indicators">
              {q.data.contracts.map((c) => (
                <article key={c.status}>
                  <h3>{stageNames[c.status] ?? c.status}</h3>
                  <strong>{c.count}</strong>
                </article>
              ))}
              <article>
                <h3>Vencem em 30 dias</h3>
                <strong>{q.data.expiring}</strong>
              </article>
              <article>
                <h3>Renovações em rascunho</h3>
                <strong>{q.data.renewals}</strong>
              </article>
            </div>
            <p className="goal-source">
              Situação contratual atual. Consulte Contratos para tratar vencimentos e renovações.
            </p>
          </FinancePanel>
          {q.data.comparison && (
            <FinancePanel title="Comparação com o período anterior">
              <div className="finance-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Atual</th>
                      <th>Anterior</th>
                      <th>Variação absoluta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.comparison.map((c) => {
                      const unit = goalMetricDefinitions.find((d) => d.code === c.code)!.unit;
                      return (
                        <tr key={c.code}>
                          <td>{goalLabel(c.code)}</td>
                          <td>{formatGoalValue(c.current, unit)}</td>
                          <td>{formatGoalValue(c.previous, unit)}</td>
                          <td>{formatGoalValue(c.change, unit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </FinancePanel>
          )}
        </>
      )}
    </section>
  );
}
type Team = {
  source: string;
  people: {
    profile: { id: string; email: string; role: string };
    leadsAssigned: number;
    goals: { items: GoalView[]; total: number };
    indicators: Indicator[];
  }[];
};
export function GoalTeamPage() {
  const { session } = useAuth(),
    filters = useAnalysisFilters(),
    [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['goals', 'team', filters.query],
    queryFn: () => authApi<Team>('/goals/team?' + filters.query),
    retry: false,
  });
  return (
    <section className="dashboard-page finance-page goals-page">
      <GoalNav />
      <PageHeader
        title="Metas por Sócio"
        description="Objetivos individuais e compartilhados para alinhamento, sem ranking obrigatório."
      >
        {session?.role === 'OWNER' && (
          <Button onClick={() => setCreating(true)}>Criar meta compartilhada</Button>
        )}
      </PageHeader>
      {filters.filters}
      <FinancePanel title="Responsabilidade e colaboração">
        <p>
          Somente administradores existentes são apresentados. Use os responsáveis para acompanhar
          metas; o resultado de uma negociação não é distribuído automaticamente entre pessoas.
        </p>
      </FinancePanel>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <FinanceError error={q.error} />
      ) : (
        <>
          <p className="goal-source">{q.data.source}</p>
          {q.data.people.map((p) => (
            <FinancePanel key={p.profile.id} title={p.profile.email}>
              <p>
                {p.profile.role} · {p.leadsAssigned} leads atualmente sob responsabilidade
              </p>
              <div className="goal-indicators">
                {p.indicators.map((i) => (
                  <article key={i.code}>
                    <h3>{goalLabel(i.code)}</h3>
                    <strong>{formatGoalValue(i.value, 'COUNT')}</strong>
                    <p className="goal-source">{i.source}</p>
                  </article>
                ))}
              </div>
              <h3>Objetivos atribuídos</h3>
              {p.goals.items.map((g) => (
                <article key={g.id} className="goal-team-objective">
                  <Link to={'/goals/detail/' + g.id}>{g.title}</Link>
                  <GoalBadge status={g.progress.status} />
                  <GoalProgressBar p={g.progress} />
                </article>
              ))}
              {!p.goals.items.length && <p>Nenhuma meta autorizada atribuída neste recorte.</p>}
              <Link to={'/goals/team/objectives?responsibleId=' + p.profile.id}>
                Consultar objetivos e registrar atividades
              </Link>
            </FinancePanel>
          ))}
          {!q.data.people.length && <p>Nenhum administrador ativo neste recorte.</p>}
        </>
      )}
      {creating && <GoalEditor category="TEAM" onClose={() => setCreating(false)} />}
    </section>
  );
}
