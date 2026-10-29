import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Wallet, Users, ChartNoAxesCombined, ArrowUpRight, Plus } from 'lucide-react';
import {
  goalMetricDefinitions,
  goalStatuses,
  type GoalView,
  type GoalsSummary,
} from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { PageHeader, LoadingState } from '@/components/shared/DashboardComponents';
import {
  FinanceForm,
  FinancePanel,
  FinanceError,
  today,
  type Field,
} from '@/features/finance/finance-ui';
import { Metric } from '@/features/clients/commercial-ui';
import { GoalEditor } from './GoalEditor';
import {
  GoalNav,
  GoalBadge,
  GoalProgressBar,
  GoalPager,
  goalNames,
  goalLabel,
  formatGoalValue,
  humanDate,
} from './goal-ui';
import '@/features/finance/finance.css';
import './goals.css';
const cards = [
  {
    path: 'commercial',
    title: 'Metas Comerciais',
    description: 'Monitore prospecção, negociações, propostas comerciais e aquisição de clientes.',
    Icon: Target,
  },
  {
    path: 'financial',
    title: 'Metas Financeiras',
    description:
      'Acompanhe objetivos de faturamento, receitas recebidas, custos e crescimento financeiro.',
    Icon: Wallet,
  },
  {
    path: 'team',
    title: 'Metas por Sócio',
    description: 'Distribua responsabilidades e acompanhe objetivos individuais e compartilhados.',
    Icon: Users,
  },
  {
    path: 'analytics',
    title: 'Indicadores Estratégicos',
    description: 'Analise a evolução comercial, financeira e operacional da VYMPA.',
    Icon: ChartNoAxesCombined,
  },
];
export function GoalsPage() {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ['goals', 'summary'],
    queryFn: () => authApi<GoalsSummary>('/goals/summary'),
    retry: false,
  });
  return (
    <section className="dashboard-page finance-page goals-page">
      <PageHeader
        title="Central de Metas"
        description="Defina objetivos, acompanhe resultados e visualize o desempenho estratégico da VYMPA."
      />
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <FinanceError error={q.error} />
      ) : (
        <div className="finance-metrics">
          <Metric label="Metas ativas" value={q.data.active} />
          <Metric label="Alcançadas" value={q.data.achieved} />
          <Metric label="Próximas do prazo" value={q.data.expiring} />
          <Metric label="Em risco" value={q.data.atRisk} />
          <Metric label="Atrasadas" value={q.data.overdue} />
        </div>
      )}
      <div className="goals-hub">
        {cards.map((c) => (
          <article key={c.path}>
            <c.Icon size={28} />
            <h2>{c.title}</h2>
            <p>{c.description}</p>
            {session?.role === 'OWNER' || ['commercial', 'team'].includes(c.path) ? (
              <Link to={'/goals/' + c.path}>
                Abrir {c.title.toLowerCase()} <ArrowUpRight size={16} />
              </Link>
            ) : (
              <span className="goal-source">Acesso restrito ao OWNER</span>
            )}
          </article>
        ))}
      </div>
      {q.data && (
        <FinancePanel title="Atenção aos próximos prazos">
          {q.data.items.length ? (
            q.data.items.map((g) => (
              <p key={g.id}>
                <Link to={'/goals/detail/' + g.id}>{g.name}</Link> · até {humanDate(g.dueAt)}
              </p>
            ))
          ) : (
            <p>Nenhuma meta autorizada próxima do prazo.</p>
          )}
        </FinancePanel>
      )}
    </section>
  );
}
export function GoalList({ category }: { category: 'COMMERCIAL' | 'FINANCIAL' | 'TEAM' }) {
  const [searchParams] = useSearchParams();
  const { session } = useAuth(),
    [creating, setCreating] = useState(false),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [segment, setSegment] = useState(''),
    [metric, setMetric] = useState(''),
    [responsibleId, setResponsible] = useState(searchParams.get('responsibleId') ?? ''),
    [startsOn, setStart] = useState(''),
    [endsOn, setEnd] = useState(''),
    [page, setPage] = useState(1);
  const qs = new URLSearchParams({
    category,
    page: String(page),
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    ...(segment ? { segment } : {}),
    ...(metric ? { metric } : {}),
    ...(responsibleId ? { responsibleId } : {}),
    ...(startsOn ? { startsOn } : {}),
    ...(endsOn ? { endsOn } : {}),
  });
  const q = useQuery({
    queryKey: ['goals', 'list', qs.toString()],
    queryFn: () => authApi<{ items: GoalView[]; total: number }>('/goals?' + qs),
    retry: false,
  });
  const users = useQuery({
    queryKey: ['assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
  });
  const title =
    category === 'COMMERCIAL'
      ? 'Metas Comerciais'
      : category === 'FINANCIAL'
        ? 'Metas Financeiras'
        : 'Objetivos compartilhados';
  function filter(fn: (s: string) => void, value: string) {
    fn(value);
    setPage(1);
  }
  return (
    <section className="dashboard-page finance-page goals-page">
      <GoalNav />
      <PageHeader
        title={title}
        description={
          category === 'FINANCIAL'
            ? 'Caixa recebido, previsão e MRR são acompanhados separadamente.'
            : 'Acompanhe metas com fonte de dados, período e responsabilidades explícitas.'
        }
      >
        {session?.role === 'OWNER' && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} /> Criar meta
          </Button>
        )}
      </PageHeader>
      <div className="goal-filters">
        <label>
          Pesquisar
          <input
            value={query}
            onChange={(e) => filter(setQuery, e.target.value)}
            placeholder="Nome da meta"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => filter(setStatus, e.target.value)}>
            <option value="">Todos</option>
            {goalStatuses.map((s) => (
              <option key={s} value={s}>
                {goalNames[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Segmento
          <select value={segment} onChange={(e) => filter(setSegment, e.target.value)}>
            <option value="">Todos</option>
            <option value="ADVOCACIA">Advocacia</option>
            <option value="CONTABILIDADE">Contabilidade</option>
            <option value="IMOBILIARIO">Imobiliário</option>
          </select>
        </label>
        <label>
          Indicador
          <select value={metric} onChange={(e) => filter(setMetric, e.target.value)}>
            <option value="">Todos</option>
            {goalMetricDefinitions
              .filter((m) => (category === 'FINANCIAL' ? m.financial : !m.financial))
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Responsável
          <select value={responsibleId} onChange={(e) => filter(setResponsible, e.target.value)}>
            <option value="">Todos autorizados</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="date" value={startsOn} onChange={(e) => filter(setStart, e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={endsOn} onChange={(e) => filter(setEnd, e.target.value)} />
        </label>
      </div>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <FinanceError error={q.error} />
      ) : (
        <>
          <div className="goals-list">
            {q.data.items.map((g) => (
              <article className="goal-tile" key={g.id}>
                <div className="goal-tile-heading">
                  <GoalBadge status={g.progress.status} />
                  <span>
                    {goalNames[g.mode]} · {goalNames[g.priority]}
                  </span>
                </div>
                <Link to={'/goals/detail/' + g.id}>
                  <h2>{g.title}</h2>
                </Link>
                <p>{goalLabel(g.metric)}</p>
                <GoalProgressBar p={g.progress} />
                <dl className="goal-values">
                  <div>
                    <dt>Alvo</dt>
                    <dd>{formatGoalValue(g.target, g.unit)}</dd>
                  </div>
                  <div>
                    <dt>Realizado</dt>
                    <dd>{formatGoalValue(g.progress.value, g.unit)}</dd>
                  </div>
                  <div>
                    <dt>{g.direction === 'GROWTH' ? 'Faltam' : 'Excesso sobre o limite'}</dt>
                    <dd>{formatGoalValue(g.progress.remaining, g.unit)}</dd>
                  </div>
                </dl>
                <p className="goal-source">
                  {humanDate(g.startsOn)} → {humanDate(g.endsOn)} ·{' '}
                  {g.assignments.map((a) => a.profile.email).join(', ') || 'Toda a empresa'}
                </p>
                {g.progress.reason && <p className="goal-notice">{g.progress.reason}</p>}
                <Link to={'/goals/detail/' + g.id}>
                  Acompanhar meta <ArrowUpRight size={14} />
                </Link>
              </article>
            ))}
          </div>
          {!q.data.items.length && (
            <FinancePanel title="Nenhuma meta encontrada">
              <p>
                Defina um objetivo ou ajuste os filtros. Nenhum resultado ilustrativo é usado como
                dado da empresa.
              </p>
            </FinancePanel>
          )}
          <GoalPager page={page} total={q.data.total} onPage={setPage} />
        </>
      )}
      {creating && <GoalEditor category={category} onClose={() => setCreating(false)} />}
    </section>
  );
}
type Activity = {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
  actor: { email: string };
  before?: unknown;
  after?: unknown;
};
export function GoalDetails() {
  const { id = '' } = useParams(),
    { session } = useAuth(),
    owner = session?.role === 'OWNER',
    qc = useQueryClient(),
    [edit, setEdit] = useState(false),
    [page, setPage] = useState(1),
    [asOf, setAsOf] = useState(''),
    [actionError, setActionError] = useState<unknown>(null),
    [dialog, setDialog] = useState<{
      title: string;
      description: string;
      fields: Field[];
      save: (d: Record<string, unknown>) => Promise<unknown>;
      initial?: Record<string, unknown>;
    } | null>(null);
  const q = useQuery({
    queryKey: ['goals', 'detail', id, asOf],
    queryFn: () => authApi<GoalView>('/goals/' + id + (asOf ? '?asOf=' + asOf : '')),
    retry: false,
  });
  const history = useQuery({
    queryKey: ['goals', 'history', id, page],
    queryFn: () => authApi<Activity[]>('/goals/' + id + '/history?page=' + page),
    retry: false,
  });
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['goals'] }),
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
    ]);
  }
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <FinanceError error={q.error} />;
  const g = q.data;
  function action(
    title: string,
    path: string,
    extra: Field[] = [],
    initial?: Record<string, unknown>,
  ) {
    const key = crypto.randomUUID();
    setDialog({
      title,
      description: 'A ação será registrada com responsável, data e justificativa.',
      fields: [
        ...extra,
        { name: 'reason', label: 'Justificativa', kind: 'textarea', required: true },
      ],
      initial,
      save: (d) =>
        authApi('/goals/' + id + path, 'POST', {
          ...d,
          version: g.version,
          ...(path === '/manual-updates'
            ? { requestKey: key, value: String(d.value).replace(',', '.') }
            : {}),
        }),
    });
  }
  return (
    <section className="dashboard-page finance-page goals-page">
      <GoalNav />
      <PageHeader title={g.title} description={g.description ?? goalLabel(g.metric)}>
        {owner && !g.cancelledAt && <Button onClick={() => setEdit(true)}>Editar meta</Button>}
      </PageHeader>
      <div className="goal-tile-heading">
        <GoalBadge status={g.progress.status} />
        <span>
          {goalNames[g.mode]} · {goalNames[g.category]} · Versão {g.version}
        </span>
      </div>
      <FinancePanel title="Progresso e origem">
        <GoalProgressBar p={g.progress} />
        <dl className="goal-values">
          <div>
            <dt>Valor-alvo</dt>
            <dd>{formatGoalValue(g.target, g.unit)}</dd>
          </div>
          <div>
            <dt>Realizado</dt>
            <dd>{formatGoalValue(g.progress.value, g.unit)}</dd>
          </div>
          <div>
            <dt>{g.direction === 'GROWTH' ? 'Valor restante' : 'Acima do limite'}</dt>
            <dd>{formatGoalValue(g.progress.remaining, g.unit)}</dd>
          </div>
          {g.baseline !== null && (
            <div>
              <dt>Base de comparação</dt>
              <dd>{formatGoalValue(g.baseline, g.unit)}</dd>
            </div>
          )}
        </dl>
        {g.progress.withinLimit !== null && (
          <p>
            {g.progress.withinLimit ? 'Dentro do limite definido.' : 'Acima do limite definido.'} A
            conclusão de metas de despesas é avaliada após o fim do período.
          </p>
        )}
        <p>
          {humanDate(g.startsOn)} → {humanDate(g.endsOn)} · {goalNames[g.periodicity]} · Alerta:{' '}
          {g.alertDays} dias
        </p>
        <p>
          Responsáveis: {g.assignments.map((a) => a.profile.email).join(', ') || 'Toda a empresa'} ·{' '}
          {goalNames[g.scope]}
        </p>
        <p className="goal-source">Fonte: {g.progress.source}</p>
        <p className="goal-source">
          Atualização: {new Date(g.progress.updatedAt).toLocaleString('pt-BR')} · Corte:{' '}
          {humanDate(g.progress.cutoff)}
        </p>
        {g.progress.reason && <p className="goal-notice">{g.progress.reason}</p>}
        <label>
          Consultar realização até a data
          <input
            aria-label="Data de corte"
            type="date"
            max={today()}
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <p className="goal-source">
          O corte usa a configuração atual da meta. Fotografias e configurações anteriores ficam
          preservadas no histórico.
        </p>
        <div className="finance-actions">
          {g.mode === 'MANUAL' && !g.cancelledAt && (owner || g.allowManualUpdates) && (
            <Button
              onClick={() =>
                action(
                  'Atualizar realização manual',
                  '/manual-updates',
                  [
                    {
                      name: 'value',
                      label: 'Valor realizado absoluto',
                      required: true,
                      hint: 'Informe o total observado; não é um incremento.',
                    },
                    {
                      name: 'observedOn',
                      label: 'Data da observação',
                      kind: 'date',
                      required: true,
                    },
                  ],
                  { observedOn: today() },
                )
              }
            >
              Atualizar realizado
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              setDialog({
                title: 'Comentar meta',
                description: 'Registre contexto útil ao acompanhamento.',
                fields: [{ name: 'body', label: 'Comentário', kind: 'textarea', required: true }],
                save: (d) => authApi('/goals/' + id + '/comments', 'POST', d),
              })
            }
          >
            Comentar
          </Button>
          {!g.cancelledAt && (
            <Button
              variant="outline"
              onClick={() =>
                action(
                  g.blocked ? 'Resolver impedimento' : 'Registrar impedimento',
                  '/blockers',
                  [{ name: 'blocked', label: 'Meta com impedimento', kind: 'checkbox' }],
                  { blocked: !g.blocked },
                )
              }
            >
              {g.blocked ? 'Resolver impedimento' : 'Registrar impedimento'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              setActionError(null);
              try {
                await authApi('/goals/' + id + '/snapshots', 'POST');
                await refresh();
              } catch (e) {
                setActionError(e);
              }
            }}
          >
            Guardar fotografia do progresso
          </Button>
          {owner && !g.cancelledAt && (
            <Button variant="outline" onClick={() => action('Cancelar meta', '/cancel')}>
              Cancelar meta
            </Button>
          )}
        </div>
        {actionError != null && <FinanceError error={actionError} />}
      </FinancePanel>
      <FinancePanel title="Histórico auditável">
        {history.isError ? (
          <FinanceError error={history.error} />
        ) : history.isPending ? (
          <LoadingState />
        ) : (
          <>
            <ol className="goal-history">
              {history.data.map((h) => (
                <li key={h.id}>
                  <strong>{h.kind}</strong>
                  <p>{h.body}</p>
                  <small>
                    {new Date(h.createdAt).toLocaleString('pt-BR')} · {h.actor.email}
                  </small>
                  {h.after != null && (
                    <details>
                      <summary>Dados registrados</summary>
                      <pre>{JSON.stringify(h.after, null, 2)}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ol>
            {!history.data.length && <p>Nenhum evento nesta página.</p>}
            <div className="finance-actions">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span>Página {page}</span>
              <Button
                variant="outline"
                disabled={history.data.length < 30}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </FinancePanel>
      {edit && <GoalEditor initial={g} onClose={() => setEdit(false)} />}
      {dialog && (
        <FinanceForm
          title={dialog.title}
          description={dialog.description}
          fields={dialog.fields}
          initial={dialog.initial}
          onClose={() => setDialog(null)}
          onSave={async (d) => {
            await dialog.save(d);
            await refresh();
          }}
        />
      )}
    </section>
  );
}
