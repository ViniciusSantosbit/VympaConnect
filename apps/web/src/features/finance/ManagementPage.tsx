import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { Plus, Wallet } from 'lucide-react';
import { brl } from '@vympa/shared';
import type {
  AiCostRecord,
  CategoryRecord,
  EntryRecord,
  FinanceAuditRecord,
  FinancialSummary,
  InvestmentRecord,
  RecurringRecord,
} from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { PageHeader } from '@/components/shared/DashboardComponents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FinanceBack,
  FinanceError,
  FinanceForm,
  FinancePanel,
  FinancialMetric,
  currentMonth,
  today,
  dateText,
  statusNames,
} from './finance-ui';
import type { Field } from './finance-ui';
import './finance.css';
type EditDialog = {
  title: string;
  description: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  save: (data: Record<string, unknown>) => Promise<unknown>;
};
const statusOptions = ['PLANNED', 'PENDING', 'SETTLED', 'CANCELLED'].map((value) => ({
  value,
  label: statusNames[value]!,
}));
const groups = ['GENERAL', 'AI', 'INFRA', 'INVESTMENT'].map((value) => ({
  value,
  label: statusNames[value]!,
}));
const asData = (value: unknown) => value as Record<string, unknown>;
export function ManagementPage() {
  const client = useQueryClient();
  const [period, setPeriod] = useState(currentMonth());
  const [tab, setTab] = useState('entries');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [basis, setBasis] = useState('ACCRUAL');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<EditDialog | null>(null);
  const query = new URLSearchParams({
    period,
    basis,
    page: String(page),
    ...(category ? { categoryId: category } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  }).toString();
  const summary = useQuery({
    queryKey: ['finance-management', 'summary', period, category, type],
    queryFn: () =>
      authApi<FinancialSummary>(
        '/finance/management/summary?' +
          new URLSearchParams({
            period,
            ...(category ? { categoryId: category } : {}),
            ...(type ? { type } : {}),
          }),
      ),
    retry: false,
  });
  const entries = useQuery({
    queryKey: ['finance-management', 'entries', query],
    queryFn: () =>
      authApi<{ items: EntryRecord[]; total: number }>('/finance/management/transactions?' + query),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['finance-management', 'categories'],
    queryFn: () => authApi<CategoryRecord[]>('/finance/management/categories'),
    retry: false,
  });
  const recurring = useQuery({
    queryKey: ['finance-management', 'recurring'],
    queryFn: () => authApi<RecurringRecord[]>('/finance/management/recurring'),
    retry: false,
  });
  const investments = useQuery({
    queryKey: ['finance-management', 'investments'],
    queryFn: () => authApi<InvestmentRecord[]>('/finance/management/investments'),
    retry: false,
  });
  const ai = useQuery({
    queryKey: ['finance-management', 'ai', period],
    queryFn: () => authApi<AiCostRecord[]>('/finance/management/ai-costs?period=' + period),
    retry: false,
  });
  const audits = useQuery({
    queryKey: ['finance-management', 'audit'],
    queryFn: () => authApi<FinanceAuditRecord[]>('/finance/management/audit'),
    retry: false,
  });
  const users = useQuery({
    queryKey: ['prospecting-assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
    retry: false,
  });
  async function write(path: string, body: unknown, method = 'POST') {
    const result = await authApi('/finance/management/' + path, method, body);
    await client.invalidateQueries({ queryKey: ['finance-management'] });
    await client.invalidateQueries({ queryKey: ['dashboard-summary'] });
    return result;
  }
  const action = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: unknown; method?: string }) =>
      write(path, body, method),
  });
  const cats = (categories.data ?? [])
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name }));
  const people = (users.data ?? []).map((u) => ({ value: u.id, label: u.email }));
  const entryFields: Field[] = [
    { name: 'description', label: 'Descrição', required: true },
    {
      name: 'type',
      label: 'Tipo',
      kind: 'select',
      required: true,
      options: [
        { value: 'INCOME', label: 'Receita' },
        { value: 'EXPENSE', label: 'Despesa' },
      ],
    },
    { name: 'amountCents', label: 'Valor (R$)', kind: 'money', required: true },
    { name: 'categoryId', label: 'Categoria', kind: 'select', required: true, options: cats },
    { name: 'competenceOn', label: 'Competência', kind: 'date', required: true },
    { name: 'dueOn', label: 'Vencimento / recebimento previsto', kind: 'date' },
    { name: 'status', label: 'Status', kind: 'select', required: true, options: statusOptions },
    {
      name: 'settledOn',
      label: 'Data efetiva de caixa',
      kind: 'date',
      hint: 'Somente recebimentos e pagamentos já realizados.',
    },
    { name: 'counterparty', label: 'Cliente ou fornecedor (referência opcional)' },
    { name: 'serviceReference', label: 'Serviço relacionado (opcional)' },
    { name: 'paymentMethod', label: 'Forma de recebimento / pagamento' },
    { name: 'notes', label: 'Observações', kind: 'textarea' },
  ];
  function entryEdit(row?: EntryRecord, entryType: 'INCOME' | 'EXPENSE' = 'INCOME') {
    const key = row?.requestKey ?? crypto.randomUUID();
    setDialog({
      title: row
        ? 'Editar lançamento'
        : 'Registrar ' + (entryType === 'INCOME' ? 'receita' : 'despesa'),
      description:
        'Valores em BRL. Previsto e pendente não alteram o caixa realizado. Toda alteração fica auditada.',
      fields: entryFields,
      initial: row ? asData(row) : { type: entryType, status: 'PENDING', competenceOn: today() },
      save: (d) =>
        write(
          'transactions' + (row ? '/' + row.id : ''),
          {
            ...Object.fromEntries(
              Object.entries(d).filter(
                ([k, v]) => !['clientId', 'contractId', 'billingReference'].includes(k) || !!v,
              ),
            ),
            requestKey: key,
            version: row?.version,
          },
          row ? 'PUT' : 'POST',
        ),
    });
  }
  function cancel(row: EntryRecord) {
    if (
      !window.confirm(
        'Cancelar este lançamento? O histórico será preservado e seu efeito no caixa será revertido.',
      )
    )
      return;
    action.mutate({
      path: 'transactions/' + row.id,
      method: 'PUT',
      body: {
        requestKey: row.requestKey,
        description: row.description,
        type: row.type,
        amountCents: row.amountCents,
        categoryId: row.categoryId,
        competenceOn: row.competenceOn.slice(0, 10),
        dueOn: row.dueOn?.slice(0, 10) ?? null,
        settledOn: null,
        status: 'CANCELLED',
        counterparty: row.counterparty ?? undefined,
        serviceReference: row.serviceReference ?? undefined,
        paymentMethod: row.paymentMethod ?? undefined,
        notes: row.notes ?? undefined,
        version: row.version,
      },
    });
  }
  function editCategory(row?: CategoryRecord) {
    setDialog({
      title: row ? 'Editar categoria' : 'Nova categoria',
      description:
        'A classificação orienta os indicadores. Alterar a categoria não reclassifica automaticamente lançamentos históricos.',
      fields: [
        { name: 'name', label: 'Nome', required: true },
        { name: 'group', label: 'Classificação', kind: 'select', required: true, options: groups },
        { name: 'active', label: 'Categoria ativa', kind: 'checkbox' },
      ],
      initial: row ? asData(row) : { group: 'GENERAL', active: true },
      save: (d) =>
        write(
          'categories' + (row ? '/' + row.id : ''),
          { ...d, version: row?.version ?? 0 },
          row ? 'PUT' : 'POST',
        ),
    });
  }
  function editRecurring(row?: RecurringRecord) {
    setDialog({
      title: row ? 'Editar recorrência' : 'Nova despesa recorrente',
      description:
        'A geração é mensal e manual. Cada período gera no máximo uma pendência; nunca um pagamento automático.',
      fields: [
        { name: 'description', label: 'Descrição', required: true },
        { name: 'amountCents', label: 'Valor mensal (R$)', kind: 'money', required: true },
        { name: 'categoryId', label: 'Categoria', kind: 'select', required: true, options: cats },
        {
          name: 'dueDay',
          label: 'Dia do vencimento',
          kind: 'number',
          required: true,
          min: 1,
          max: 31,
          hint: 'Meses curtos usam o último dia disponível.',
        },
        { name: 'startsOn', label: 'Início', kind: 'date', required: true },
        { name: 'endsOn', label: 'Fim (opcional)', kind: 'date' },
        { name: 'supplier', label: 'Fornecedor' },
        { name: 'active', label: 'Recorrência ativa', kind: 'checkbox' },
        { name: 'notes', label: 'Observações', kind: 'textarea' },
      ],
      initial: row ? asData(row) : { startsOn: today(), active: true, dueDay: 1 },
      save: (d) =>
        write(
          'recurring' + (row ? '/' + row.id : ''),
          { ...d, version: row?.version ?? 0 },
          row ? 'PUT' : 'POST',
        ),
    });
  }
  function editInvestment(row?: InvestmentRecord) {
    setDialog({
      title: row ? 'Editar investimento' : 'Planejar investimento',
      description:
        'Planejamento não altera o caixa. Pagamento será registrado separadamente e vinculado a uma única despesa.',
      fields: [
        { name: 'name', label: 'Nome', required: true },
        { name: 'description', label: 'Descrição', kind: 'textarea' },
        { name: 'estimatedCents', label: 'Valor estimado (R$)', kind: 'money', required: true },
        {
          name: 'priority',
          label: 'Prioridade',
          kind: 'select',
          required: true,
          options: ['LOW', 'MEDIUM', 'HIGH'].map((value) => ({
            value,
            label: statusNames[value]!,
          })),
        },
        { name: 'categoryId', label: 'Categoria', kind: 'select', required: true, options: cats },
        {
          name: 'responsibleId',
          label: 'Responsável',
          kind: 'select',
          required: true,
          options: people,
        },
        { name: 'plannedOn', label: 'Data prevista', kind: 'date', required: true },
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          required: true,
          options: ['PLANNED', 'APPROVED', 'CANCELLED'].map((value) => ({
            value,
            label: statusNames[value]!,
          })),
        },
        { name: 'notes', label: 'Observações', kind: 'textarea' },
      ],
      initial: row ? asData(row) : { plannedOn: today(), priority: 'MEDIUM', status: 'PLANNED' },
      save: (d) =>
        write(
          'investments' + (row ? '/' + row.id : ''),
          { ...d, version: row?.version ?? 0 },
          row ? 'PUT' : 'POST',
        ),
    });
  }
  function payInvestment(row: InvestmentRecord) {
    const key = crypto.randomUUID();
    setDialog({
      title: 'Registrar pagamento do investimento',
      description:
        'Confirme o valor e a data efetivamente pagos. Uma única despesa será criada no caixa.',
      fields: [
        { name: 'amountCents', label: 'Valor realizado (R$)', kind: 'money', required: true },
        { name: 'settledOn', label: 'Data efetiva de caixa', kind: 'date', required: true },
      ],
      initial: { amountCents: row.estimatedCents, settledOn: today(), status: 'SETTLED' },
      save: (d) =>
        write('investments/' + row.id + '/pay', { ...d, version: row.version, requestKey: key }),
    });
  }
  function editAi(row?: AiCostRecord) {
    setDialog({
      title: row ? 'Editar custo de IA' : 'Registrar custo de IA',
      description:
        'Controle de uso e custos. Sem vínculo com uma despesa, este registro não movimenta caixa. O vínculo evita dupla contabilização.',
      fields: [
        { name: 'provider', label: 'Provedor', required: true },
        { name: 'modelService', label: 'Modelo ou serviço', required: true },
        { name: 'amountCents', label: 'Valor (R$)', kind: 'money', required: true },
        { name: 'period', label: 'Período', kind: 'month', required: true },
        { name: 'projectReference', label: 'Projeto / cliente (referência opcional)' },
        { name: 'unit', label: 'Unidade de cobrança' },
        {
          name: 'quantity',
          label: 'Quantidade consumida',
          hint: 'Use ponto para casas decimais, quando conhecida.',
        },
        {
          name: 'transactionId',
          label: 'Despesa de IA vinculada (opcional)',
          kind: 'select',
          options: (entries.data?.items ?? [])
            .filter(
              (e) => e.type === 'EXPENSE' && e.categoryGroup === 'AI' && e.status !== 'CANCELLED',
            )
            .map((e) => ({ value: e.id, label: e.description + ' · ' + brl(e.amountCents) })),
        },
        { name: 'notes', label: 'Observações', kind: 'textarea' },
      ],
      initial: row ? asData(row) : { period },
      save: (d) =>
        write(
          'ai-costs' + (row ? '/' + row.id : ''),
          { ...d, version: row?.version ?? 0 },
          row ? 'PUT' : 'POST',
        ),
    });
  }
  const s = summary.data;
  return (
    <section className="dashboard-page finance-page">
      <FinanceBack />
      <PageHeader
        title="Gestão Financeira da VYMPA"
        description="Recebimentos, pagamentos e decisões financeiras reais. Acesso privado OWNER."
      />
      <div className="finance-banner">
        <Wallet size={20} />
        <p>
          Somente receitas recebidas e despesas pagas compõem o caixa. Propostas, contratos,
          pendências e investimentos planejados ficam fora do realizado.
        </p>
      </div>
      <div className="finance-actions">
        <label>
          Período
          <Input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <Button
          variant="outline"
          onClick={() =>
            setDialog({
              title: 'Configurar saldo inicial',
              description:
                'Informe o saldo real na data de referência. Lançamentos anteriores à data não serão somados novamente. A alteração será auditada.',
              fields: [
                {
                  name: 'amountCents',
                  label: 'Saldo inicial (R$)',
                  kind: 'money',
                  required: true,
                  signed: true,
                },
                { name: 'effectiveOn', label: 'Data de referência', kind: 'date', required: true },
              ],
              initial: s?.opening ? asData(s.opening) : { effectiveOn: today() },
              save: (d) =>
                write('opening-balance', { ...d, version: s?.opening?.version ?? 0 }, 'PUT'),
            })
          }
        >
          Configurar saldo inicial
        </Button>
      </div>
      {summary.isPending ? (
        <p role="status">Carregando indicadores financeiros…</p>
      ) : summary.isError ? (
        <FinanceError error={summary.error} />
      ) : (
        s && (
          <>
            <div className="finance-metrics">
              <FinancialMetric label="Receitas recebidas no mês" value={s.receivedCents} />
              <FinancialMetric label="Despesas pagas no mês" value={s.paidCents} />
              <FinancialMetric
                label="Saldo de caixa até o fim do período"
                value={s.balanceCents}
                note="Saldo inicial aplicável + entradas recebidas − saídas pagas."
              />
              <FinancialMetric label="Resultado realizado do mês" value={s.resultCents} />
              <FinancialMetric
                label="Receitas previstas / pendentes do mês"
                value={s.pendingIncomeCents}
              />
              <FinancialMetric label="Contas a pagar do mês" value={s.pendingExpenseCents} />
              <FinancialMetric label="IA paga no mês" value={s.aiCents} />
              <FinancialMetric label="Infraestrutura paga no mês" value={s.infrastructureCents} />
              <FinancialMetric label="Investimentos pagos no mês" value={s.investmentCents} />
            </div>
            <FinancePanel title="Previsão separada do caixa realizado">
              <strong className="finance-forecast">{brl(s.forecastCents)}</strong>
              <p>
                Saldo até o período + receitas previstas/pendentes − contas previstas/pendentes do
                mês. Não representa dinheiro já recebido.
              </p>
              <small>
                Saldo inicial configurado:{' '}
                {s.opening
                  ? brl(s.opening.amountCents) + ' em ' + dateText(s.opening.effectiveOn)
                  : 'R$ 0,00 · não configurado'}
              </small>
            </FinancePanel>
            <div className="finance-chart-grid">
              <FinancePanel title="Entradas e saídas realizadas">
                <div
                  className="finance-chart"
                  role="img"
                  aria-label="Receitas recebidas e despesas pagas por mês"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.months}>
                      <CartesianGrid stroke="#263845" vertical={false} />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip formatter={(v) => brl(Number(v))} />
                      <Bar dataKey="incomeCents" name="Recebidas" fill="#68dda8" />
                      <Bar dataKey="expenseCents" name="Pagas" fill="#f87171" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </FinancePanel>
              <FinancePanel title="Resultado mensal realizado">
                <div className="finance-chart" role="img" aria-label="Resultado financeiro mensal">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={s.months.map((m) => ({ ...m, net: m.incomeCents - m.expenseCents }))}
                    >
                      <CartesianGrid stroke="#263845" />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip formatter={(v) => brl(Number(v))} />
                      <Line
                        type="monotone"
                        dataKey="net"
                        name="Resultado"
                        stroke="#69d4e8"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </FinancePanel>
            </div>
          </>
        )
      )}
      <div className="finance-tabs" role="tablist" aria-label="Gestão financeira">
        {[
          ['entries', 'Lançamentos'],
          ['recurring', 'Recorrências'],
          ['investments', 'Investimentos'],
          ['ai', 'Custos de IA'],
          ['categories', 'Categorias'],
          ['audit', 'Auditoria'],
        ].map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key!)}
          >
            {label}
          </Button>
        ))}
      </div>
      {action.isError && <FinanceError error={action.error} />}
      {tab === 'entries' && (
        <FinancePanel title="Receitas e despesas">
          <div className="finance-actions">
            <Button onClick={() => entryEdit(undefined, 'INCOME')}>
              <Plus size={15} />
              Nova receita
            </Button>
            <Button variant="outline" onClick={() => entryEdit(undefined, 'EXPENSE')}>
              <Plus size={15} />
              Nova despesa
            </Button>
          </div>
          <div className="finance-filters">
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                <option value="INCOME">Receitas</option>
                <option value="EXPENSE">Despesas</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Referência das datas
              <select
                value={basis}
                onChange={(e) => {
                  setBasis(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ACCRUAL">Competência</option>
                <option value="CASH">Caixa realizado</option>
              </select>
            </label>
          </div>
          <p className="finance-note">
            Indicadores gerais usam o mês selecionado. Categoria e tipo filtram o gráfico; os demais
            filtros afetam a listagem. O saldo geral de caixa não é alterado por esses filtros.
          </p>
          {entries.isPending ? (
            <p role="status">Carregando lançamentos…</p>
          ) : entries.isError ? (
            <FinanceError error={entries.error} />
          ) : !entries.data?.items.length ? (
            <p>Nenhum lançamento neste período e filtros.</p>
          ) : (
            <div className="finance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição / categoria</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Competência</th>
                    <th>Caixa</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.data.items.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.description}</strong>
                        {e.contractId && (
                          <small>
                            <Link to={'/contracts/' + e.contractId}>Contrato relacionado</Link> ·{' '}
                            {e.billingReference}
                          </small>
                        )}
                        <small>{e.category?.name}</small>
                      </td>
                      <td>{e.type === 'INCOME' ? 'Receita' : 'Despesa'}</td>
                      <td>{brl(e.amountCents)}</td>
                      <td>{dateText(e.competenceOn)}</td>
                      <td>{dateText(e.settledOn)}</td>
                      <td>{statusNames[e.status]}</td>
                      <td>
                        <div className="finance-actions">
                          {e.status !== 'CANCELLED' && (
                            <>
                              <Button variant="ghost" onClick={() => entryEdit(e)}>
                                Editar
                              </Button>
                              <Button variant="ghost" onClick={() => cancel(e)}>
                                Cancelar lançamento
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="finance-actions">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span>
              Página {page} · {entries.data?.total ?? 0} lançamentos
            </span>
            <Button
              variant="outline"
              disabled={page * 30 >= (entries.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </FinancePanel>
      )}
      {tab === 'recurring' && (
        <FinancePanel title="Despesas recorrentes">
          <Button onClick={() => editRecurring()}>Nova recorrência</Button>
          <p>
            Geração explícita para {period}. Uma recorrência gera uma única pendência por mês e
            nunca marca pagamento.
          </p>
          {recurring.isError && <FinanceError error={recurring.error} />}
          <div className="finance-record-grid">
            {recurring.data?.map((r) => (
              <article key={r.id}>
                <h3>{r.description}</h3>
                <p>
                  {brl(r.amountCents)} · vencimento dia {r.dueDay} ·{' '}
                  {r.active ? 'Ativa' : 'Pausada'}
                </p>
                <div className="finance-actions">
                  <Button variant="outline" onClick={() => editRecurring(r)}>
                    Editar recorrência
                  </Button>
                  <Button
                    disabled={!r.active || action.isPending}
                    onClick={() =>
                      action.mutate({ path: 'recurring/' + r.id + '/generate', body: { period } })
                    }
                  >
                    Gerar pendência de {period}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {recurring.data?.length === 0 && <p>Nenhuma despesa recorrente cadastrada.</p>}
        </FinancePanel>
      )}
      {tab === 'investments' && (
        <FinancePanel title="Planejamento e realização de investimentos">
          <Button onClick={() => editInvestment()}>Planejar investimento</Button>
          {investments.isError && <FinanceError error={investments.error} />}
          <div className="finance-record-grid">
            {investments.data?.map((i) => (
              <article key={i.id}>
                <h3>{i.name}</h3>
                <p>{i.description}</p>
                <p>
                  Estimado: {brl(i.estimatedCents)} · Realizado registrado:{' '}
                  {i.actualCents === null ? 'Não realizado' : brl(i.actualCents)}
                </p>
                <p>
                  {statusNames[i.status]} · prioridade {statusNames[i.priority]} ·{' '}
                  {dateText(i.plannedOn)}
                </p>
                {i.transactionId ? (
                  <p>
                    Pagamento vinculado a um único lançamento. Correções devem cancelar o lançamento
                    na aba Lançamentos; o histórico será mantido.
                  </p>
                ) : (
                  <div className="finance-actions">
                    <Button variant="outline" onClick={() => editInvestment(i)}>
                      Editar investimento
                    </Button>
                    {i.status !== 'CANCELLED' && (
                      <Button onClick={() => payInvestment(i)}>Registrar pagamento</Button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          {investments.data?.length === 0 && <p>Nenhum investimento cadastrado.</p>}
        </FinancePanel>
      )}
      {tab === 'ai' && (
        <FinancePanel title="Custos e uso de inteligência artificial">
          <Button onClick={() => editAi()}>Registrar custo de IA</Button>
          <p>
            Registros de consumo não criam despesas automaticamente. O indicador de caixa considera
            somente despesas de IA pagas, uma única vez.
          </p>
          {ai.isError && <FinanceError error={ai.error} />}
          <div className="finance-record-grid">
            {ai.data?.map((a) => (
              <article key={a.id}>
                <h3>
                  {a.provider} · {a.modelService}
                </h3>
                <p>
                  {brl(a.amountCents)} · {a.period}
                </p>
                <p>
                  {a.quantity ?? 'Quantidade não informada'} {a.unit} · {a.projectReference}
                </p>
                <p>
                  {a.transactionId
                    ? 'Vinculado a uma despesa; sem lançamento adicional.'
                    : 'Controle de consumo sem efeito no caixa.'}
                </p>
                <Button variant="outline" onClick={() => editAi(a)}>
                  Editar custo de IA
                </Button>
              </article>
            ))}
          </div>
          {ai.data?.length === 0 && <p>Nenhum custo de IA registrado neste período.</p>}
        </FinancePanel>
      )}
      {tab === 'categories' && (
        <FinancePanel title="Categorias financeiras">
          <Button onClick={() => editCategory()}>Nova categoria</Button>
          {categories.isError && <FinanceError error={categories.error} />}
          <div className="finance-record-grid">
            {categories.data?.map((c) => (
              <article key={c.id}>
                <h3>{c.name}</h3>
                <p>
                  {statusNames[c.group]} · {c.active ? 'Ativa' : 'Inativa'}
                </p>
                <Button variant="outline" onClick={() => editCategory(c)}>
                  Editar categoria
                </Button>
              </article>
            ))}
          </div>
        </FinancePanel>
      )}
      {tab === 'audit' && (
        <FinancePanel title="Histórico financeiro auditado">
          <p>
            Últimas 100 alterações. O histórico completo permanece armazenado, sem exclusão por esta
            interface.
          </p>
          {audits.isError && <FinanceError error={audits.error} />}
          <div className="finance-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Alteração</th>
                  <th>Responsável</th>
                  <th>Valores registrados</th>
                </tr>
              </thead>
              <tbody>
                {audits.data?.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(a.createdAt))}
                    </td>
                    <td>{a.action.replaceAll('_', ' ').toLowerCase()}</td>
                    <td>{a.actor.email}</td>
                    <td>
                      {a.before && typeof a.before.amountCents === 'number'
                        ? brl(a.before.amountCents) + ' → '
                        : ''}
                      {typeof a.after.amountCents === 'number'
                        ? brl(a.after.amountCents)
                        : typeof a.after.monthlyCents === 'number'
                          ? brl(a.after.monthlyCents)
                          : 'Alteração de parâmetros ou estado'}
                      <small>
                        {typeof a.after.status === 'string' ? statusNames[a.after.status] : ''}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FinancePanel>
      )}
      {dialog && (
        <FinanceForm
          key={dialog.title}
          title={dialog.title}
          description={dialog.description}
          fields={dialog.fields}
          initial={dialog.initial}
          onSave={dialog.save}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
