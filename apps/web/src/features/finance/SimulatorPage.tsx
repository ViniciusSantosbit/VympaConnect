import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Save, Copy, History } from 'lucide-react';
import {
  brl,
  calculateSimulation,
  parseMoney,
  provisionalRules,
  segmentLabels,
  leadSegments,
} from '@vympa/shared';
import type {
  OfferingRecord,
  PolicyRecord,
  ProposalInput,
  ProposalRecord,
  SimulationInput,
  SimulationResult,
  LeadRecord,
} from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/DashboardComponents';
import {
  FinanceBack,
  FinanceError,
  FinanceForm,
  FinancePanel,
  FinancialMetric,
  moneyText,
  statusNames,
  today,
} from './finance-ui';
import type { Field } from './finance-ui';
import './finance.css';
const costFields = [
  ['infrastructureCents', 'Infraestrutura mensal'],
  ['aiCents', 'APIs e IA mensais'],
  ['maintenanceCents', 'Manutenção mensal'],
  ['supportCents', 'Suporte mensal'],
  ['otherCents', 'Outros custos diretos mensais'],
] as const;
const prices: Field[] = [
  { name: 'name', label: 'Nome', required: true },
  { name: 'description', label: 'Descrição', kind: 'textarea' },
  { name: 'baseCents', label: 'Preço base (R$)', kind: 'money' },
  { name: 'setupCents', label: 'Implantação sugerida (R$)', kind: 'money' },
  { name: 'monthlyCents', label: 'Mensalidade sugerida (R$)', kind: 'money' },
  { name: 'operatingCents', label: 'Custos estimados mensais (R$)', kind: 'money' },
  { name: 'active', label: 'Serviço ativo', kind: 'checkbox' },
  { name: 'notes', label: 'Observações comerciais', kind: 'textarea' },
];
function DiscountEditor({ policy, onSaved }: { policy: PolicyRecord; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [points, setPoints] = useState(() =>
    policy.rules.map((p) => ({ cost: moneyText(p.atCents), discount: moneyText(p.discountBps) })),
  );
  const [provisional, setProvisional] = useState(policy.provisional);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi('/finance/discount-policy', 'PUT', {
        rules: points.map((p) => ({
          atCents: parseMoney(p.cost),
          discountBps: parseMoney(p.discount),
        })),
        provisional,
        version: policy.version,
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FinancePanel title="Política de desconto comparativo">
      <p>
        {policy.provisional
          ? 'Política provisória e editável. Não constitui limite comercial permanente.'
          : 'Política configurada pelo OWNER.'}{' '}
        Interpolação entre as faixas; acima da última faixa, a sugestão permanece no último
        percentual.
      </p>
      {!editing ? (
        <>
          <ul>
            {policy.rules.map((p) => (
              <li key={p.atCents}>
                A partir de {brl(p.atCents)}: {(p.discountBps / 100).toLocaleString('pt-BR')}%
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            onClick={() => {
              setPoints(
                policy.rules.map((p) => ({
                  cost: moneyText(p.atCents),
                  discount: moneyText(p.discountBps),
                })),
              );
              setEditing(true);
            }}
          >
            Editar política
          </Button>
        </>
      ) : (
        <form onSubmit={save}>
          <div className="finance-policy-rows">
            {points.map((p, i) => (
              <div key={i}>
                <label>
                  Custo de referência (R$)
                  <Input
                    value={p.cost}
                    inputMode="decimal"
                    required
                    onChange={(e) =>
                      setPoints(
                        points.map((v, n) => (n === i ? { ...v, cost: e.target.value } : v)),
                      )
                    }
                  />
                </label>
                <label>
                  Desconto (%)
                  <Input
                    value={p.discount}
                    inputMode="decimal"
                    required
                    onChange={(e) =>
                      setPoints(
                        points.map((v, n) => (n === i ? { ...v, discount: e.target.value } : v)),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={points.length === 1}
                  onClick={() => setPoints(points.filter((_, n) => n !== i))}
                >
                  Remover faixa
                </Button>
              </div>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={provisional}
              onChange={(e) => setProvisional(e.target.checked)}
            />{' '}
            Política provisória
          </label>
          {error !== null && <FinanceError error={error} />}
          <div className="finance-actions">
            <Button
              type="button"
              variant="outline"
              disabled={points.length >= 20}
              onClick={() => setPoints([...points, { cost: '', discount: '' }])}
            >
              Adicionar faixa
            </Button>
            <Button type="submit" disabled={busy}>
              Salvar política
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Voltar
            </Button>
          </div>
        </form>
      )}
    </FinancePanel>
  );
}
function ResultPanel({
  result,
  current,
}: {
  result: ReturnType<typeof calculateSimulation> | SimulationResult | null;
  current: number | null;
}) {
  return (
    <div className="finance-results">
      <div className="finance-metrics">
        <FinancialMetric label="Custo atual do cliente / mês" value={current} />
        <FinancialMetric label="Proposta VYMPA / mês" value={result?.monthlyCents} />
        <article className="finance-metric">
          <span>Desconto comparativo</span>
          <strong>
            {result?.discountBps != null
              ? (result.discountBps / 100).toLocaleString('pt-BR') + '%'
              : 'Não calculado'}
          </strong>
          <small>Sugestão comercial, sujeita à viabilidade</small>
        </article>
        <FinancialMetric label="Economia mensal potencial" value={result?.savingsCents} />
        <FinancialMetric label="Economia em 12 meses" value={result?.annualSavingsCents} />
        <FinancialMetric
          label="Margem de contribuição estimada"
          value={result?.contributionCents}
          note={
            result?.contributionCents == null
              ? 'Margem não calculada: informe todos os custos diretos, inclusive zeros explícitos.'
              : 'Receita proposta menos custos estimados; não representa lucro líquido.'
          }
        />
        <FinancialMetric label="Custos mensais estimados" value={result?.operatingCents} />
        <FinancialMetric label="Implantação única cobrada" value={result?.setupCents} />
        <FinancialMetric
          label="Desenvolvimento / implantação estimados"
          value={result?.estimatedDevelopmentCents}
        />
      </div>
      {result?.belowCosts && (
        <p role="alert" className="finance-warning">
          A proposta não cobre os custos mensais informados. Revise a viabilidade.
        </p>
      )}
      {result?.overlap && (
        <p className="finance-warning">
          Sistema personalizado + IA e Implementação de IA podem compartilhar escopo. Seus preços
          não serão somados automaticamente. Discrimine os componentes antes de preparar a proposta.
        </p>
      )}
      {result && result.savingsCents < 0 && (
        <p className="finance-warning">
          A proposta é mais cara que o custo atual. A diferença aparece como valor negativo.
        </p>
      )}
      <p className="finance-note">
        Simulação estimativa. Economia do cliente não é lucro da VYMPA. Implantação não é descontada
        da economia mensal. Nenhuma receita ou contrato será criado automaticamente.
      </p>
    </div>
  );
}
export function SimulatorPage() {
  const { session } = useAuth();
  const owner = session?.role === 'OWNER';
  const client = useQueryClient();
  const catalog = useQuery({
    queryKey: ['finance-catalog'],
    queryFn: () => authApi<OfferingRecord[]>('/finance/catalog'),
    retry: false,
  });
  const policy = useQuery({
    queryKey: ['finance-policy'],
    queryFn: () => authApi<PolicyRecord>('/finance/discount-policy'),
    retry: false,
  });
  const [historyPage, setHistoryPage] = useState(1);
  const history = useQuery({
    queryKey: ['finance-proposals', historyPage],
    queryFn: () => authApi<ProposalRecord[]>('/finance/simulations?page=' + historyPage),
    retry: false,
  });
  const users = useQuery({
    queryKey: ['prospecting-assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
    retry: false,
  });
  const [leadQuery, setLeadQuery] = useState('');
  const leads = useQuery({
    queryKey: ['finance-leads', leadQuery],
    queryFn: () =>
      authApi<{ items: LeadRecord[] }>('/prospecting/leads?query=' + encodeURIComponent(leadQuery)),
    retry: false,
  });
  const [form, setForm] = useState<Record<string, string>>({
    simulationDate: today(),
    segment: 'ADVOCACIA',
    setupCents: '0,00',
  });
  const [codes, setCodes] = useState<string[]>([]);
  const [editing, setEditing] = useState<ProposalRecord | null>(null);
  const [view, setView] = useState<ProposalRecord | null>(null);
  const [versionView, setVersionView] = useState<number | null>(null);
  const [priceEdit, setPriceEdit] = useState<OfferingRecord | null>(null);
  const [localError, setLocalError] = useState('');
  const put = (key: string, value: string) => setForm({ ...form, [key]: value });
  function simulation(): SimulationInput {
    const cost = parseMoney(form.currentCostCents ?? '');
    if (cost === null)
      throw new Error('Informe o custo mensal atual; zero deve ser informado explicitamente.');
    return {
      currentCostCents: cost,
      offeringCodes: codes,
      setupCents: parseMoney(form.setupCents ?? '') ?? 0,
      ...Object.fromEntries(costFields.map(([k]) => [k, parseMoney(form[k] ?? '')])),
      developmentMinutes: form.developmentHours
        ? Math.round(Number(form.developmentHours) * 60)
        : undefined,
      hourlyCents: parseMoney(form.hourlyCents ?? ''),
      ...(owner && form.manualDiscountBps
        ? { manualDiscountBps: parseMoney(form.manualDiscountBps)! }
        : {}),
      ...(owner && form.manualMonthlyCents
        ? { manualMonthlyCents: parseMoney(form.manualMonthlyCents)! }
        : {}),
      exceptionReason: form.exceptionReason || undefined,
      bundleScope: form.bundleScope || undefined,
    };
  }
  let preview: ReturnType<typeof calculateSimulation> | null = null;
  let current: number | null = null;
  let previewError = '';
  try {
    if (form.currentCostCents) {
      const dto = simulation();
      current = dto.currentCostCents;
      preview = calculateSimulation(dto, policy.data?.rules ?? provisionalRules);
    }
  } catch (e) {
    previewError = (e as Error).message;
  }
  const save = useMutation({
    mutationFn: () => {
      const input: ProposalInput = {
        ...simulation(),
        companyName: form.companyName ?? '',
        segment: form.segment as ProposalInput['segment'],
        simulationDate: form.simulationDate ?? today(),
        responsibleId: form.responsibleId ?? '',
        leadId: form.leadId || undefined,
        currentSystem: form.currentSystem || undefined,
        systemCount: form.systemCount ? Number(form.systemCount) : undefined,
        systemNotes: form.systemNotes || undefined,
        problems: form.problems || undefined,
        requirements: form.requirements || undefined,
        notes: form.notes || undefined,
        version: editing?.version,
      };
      return authApi<ProposalRecord>(
        '/finance/simulations' + (editing ? '/' + editing.id : ''),
        editing ? 'PUT' : 'POST',
        input,
      );
    },
    onSuccess: (p) => {
      setEditing(p);
      setView(p);
      setVersionView(null);
      void client.invalidateQueries({ queryKey: ['finance-proposals'] });
    },
  });
  const check = useMutation({
    mutationFn: () =>
      authApi<SimulationResult>('/finance/simulations/calculate', 'POST', simulation()),
  });
  const status = useMutation({
    mutationFn: ({ p, state }: { p: ProposalRecord; state: string }) =>
      authApi<ProposalRecord>('/finance/simulations/' + p.id + '/status', 'POST', {
        version: p.version,
        status: state,
      }),
    onSuccess: () => {
      setView(null);
      void client.invalidateQueries({ queryKey: ['finance-proposals'] });
    },
  });
  const duplicate = useMutation({
    mutationFn: (p: ProposalRecord) =>
      authApi<ProposalRecord>('/finance/simulations/' + p.id + '/duplicate', 'POST'),
    onSuccess: (p) => {
      setView(p);
      void client.invalidateQueries({ queryKey: ['finance-proposals'] });
    },
  });
  const detail = useMutation({
    mutationFn: (id: string) => authApi<ProposalRecord>('/finance/simulations/' + id),
    onSuccess: (p) => {
      setView(p);
      setVersionView(null);
    },
  });
  function edit(p: ProposalRecord) {
    const input = p.input;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) {
      if (k.endsWith('Cents') || k === 'manualDiscountBps') fields[k] = moneyText(v);
      else if (v != null && typeof v !== 'object') fields[k] = String(v);
    }
    if (input.developmentMinutes != null)
      fields.developmentHours = String(input.developmentMinutes / 60);
    setForm(fields);
    setCodes(input.offeringCodes);
    setEditing(p);
    setView(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const selectedVersion = view?.versions?.find((v) => v.version === versionView)?.snapshot ?? view;
  return (
    <section className="dashboard-page finance-page">
      <FinanceBack />
      <PageHeader
        title="Simulador de Propostas e Planos"
        description="Compare custos, avalie viabilidade e preserve o histórico das negociações."
      />
      <div className="finance-banner">
        <Calculator size={20} />
        <p>
          {policy.data?.provisional ? 'Política provisória: ' : 'Política comercial: '}descontos
          configuráveis e estimativas comerciais. Serviços sem preço não recebem valores fictícios.
        </p>
      </div>
      {(catalog.isError || policy.isError) && (
        <FinanceError error={catalog.error || policy.error} />
      )}
      <div className="simulator-layout">
        <form
          className="finance-panel finance-form"
          onSubmit={(e) => {
            e.preventDefault();
            setLocalError('');
            try {
              simulation();
              save.mutate();
            } catch (err) {
              setLocalError((err as Error).message);
            }
          }}
        >
          <h2>{editing ? 'Editar rascunho · versão ' + editing.version : 'Nova simulação'}</h2>
          <fieldset>
            <legend>Empresa e negociação</legend>
            <div className="finance-form-grid">
              <label>
                Empresa prospectada
                <Input
                  required
                  maxLength={180}
                  value={form.companyName ?? ''}
                  onChange={(e) => put('companyName', e.target.value)}
                />
              </label>
              <label>
                Segmento
                <select
                  aria-label="Segmento"
                  value={form.segment}
                  onChange={(e) => put('segment', e.target.value)}
                >
                  {leadSegments.map((s) => (
                    <option key={s} value={s}>
                      {segmentLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsável
                <select
                  aria-label="Responsável"
                  required
                  value={form.responsibleId ?? ''}
                  onChange={(e) => put('responsibleId', e.target.value)}
                >
                  <option value="">Selecione</option>
                  {users.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data da simulação
                <Input
                  type="date"
                  required
                  value={form.simulationDate}
                  onChange={(e) => put('simulationDate', e.target.value)}
                />
              </label>
              <label>
                Buscar lead no CRM
                <Input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Nome ou referência"
                />
              </label>
              <label>
                Lead associado (opcional)
                <select value={form.leadId ?? ''} onChange={(e) => put('leadId', e.target.value)}>
                  <option value="">Sem vínculo</option>
                  {form.leadId && !leads.data?.items.some((l) => l.id === form.leadId) && (
                    <option value={form.leadId}>Lead vinculado</option>
                  )}
                  {leads.data?.items.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.companyName ?? 'Referência ' + l.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Sistemas atuais do cliente</legend>
            <div className="finance-form-grid">
              <label>
                Sistema atual
                <Input
                  maxLength={180}
                  value={form.currentSystem ?? ''}
                  onChange={(e) => put('currentSystem', e.target.value)}
                />
              </label>
              <label>
                Quantidade de sistemas
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={form.systemCount ?? ''}
                  onChange={(e) => put('systemCount', e.target.value)}
                />
              </label>
              <label className="full-width">
                Custo mensal atual total (R$)
                <Input
                  inputMode="decimal"
                  required
                  value={form.currentCostCents ?? ''}
                  onChange={(e) => put('currentCostCents', e.target.value)}
                  placeholder="Informe o custo real do cliente"
                />
              </label>
              {[
                ['systemNotes', 'Observações sobre os sistemas'],
                ['problems', 'Problemas identificados'],
                ['requirements', 'Funcionalidades necessárias'],
              ].map(([key, label]) => (
                <label key={key} className="full-width">
                  {label}
                  <textarea
                    maxLength={4000}
                    value={form[key!] ?? ''}
                    onChange={(e) => put(key!, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Serviços da proposta</legend>
            {catalog.data
              ?.filter((o) => o.active)
              .map((o) => (
                <label className="finance-service-choice" key={o.code}>
                  <input
                    type="checkbox"
                    checked={codes.includes(o.code)}
                    onChange={(e) =>
                      setCodes(
                        e.target.checked ? [...codes, o.code] : codes.filter((c) => c !== o.code),
                      )
                    }
                  />
                  <span>
                    <strong>{o.name}</strong>
                    <small>
                      {o.monthlyCents === null
                        ? 'Preço não definido'
                        : brl(o.monthlyCents) + ' / mês'}
                    </small>
                  </span>
                </label>
              ))}
            <label>
              Escopo consolidado / serviços compartilhados
              <textarea
                value={form.bundleScope ?? ''}
                maxLength={2000}
                onChange={(e) => put('bundleScope', e.target.value)}
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>Custos diretos estimados da VYMPA</legend>
            <p className="finance-note">
              Campos vazios representam custo desconhecido. Informe zero somente quando tiver
              confirmado ausência do custo.
            </p>
            <div className="finance-form-grid">
              {costFields.map(([key, label]) => (
                <label key={key}>
                  {label} (R$)
                  <Input
                    inputMode="decimal"
                    value={form[key] ?? ''}
                    onChange={(e) => put(key, e.target.value)}
                  />
                </label>
              ))}
              <label>
                Implantação única cobrada (R$)
                <Input
                  inputMode="decimal"
                  value={form.setupCents ?? ''}
                  onChange={(e) => put('setupCents', e.target.value)}
                />
              </label>
              <label>
                Horas estimadas de desenvolvimento
                <Input
                  type="number"
                  min={0}
                  step="0.25"
                  value={form.developmentHours ?? ''}
                  onChange={(e) => put('developmentHours', e.target.value)}
                />
              </label>
              <label>
                Custo estimado por hora (R$)
                <Input
                  inputMode="decimal"
                  value={form.hourlyCents ?? ''}
                  onChange={(e) => put('hourlyCents', e.target.value)}
                />
              </label>
            </div>
          </fieldset>
          {owner && (
            <fieldset>
              <legend>Exceção comercial · somente OWNER</legend>
              <p className="finance-note">
                Use percentual OU mensalidade negociada e registre a justificativa.
              </p>
              <div className="finance-form-grid">
                <label>
                  Desconto manual (%)
                  <Input
                    inputMode="decimal"
                    value={form.manualDiscountBps ?? ''}
                    onChange={(e) => put('manualDiscountBps', e.target.value)}
                  />
                </label>
                <label>
                  Mensalidade negociada (R$)
                  <Input
                    inputMode="decimal"
                    value={form.manualMonthlyCents ?? ''}
                    onChange={(e) => put('manualMonthlyCents', e.target.value)}
                  />
                </label>
                <label className="full-width">
                  Justificativa
                  <textarea
                    maxLength={2000}
                    value={form.exceptionReason ?? ''}
                    onChange={(e) => put('exceptionReason', e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
          )}
          <label>
            Observações comerciais
            <textarea
              maxLength={4000}
              value={form.notes ?? ''}
              onChange={(e) => put('notes', e.target.value)}
            />
          </label>
          {(localError || previewError) && (
            <p role="alert" className="finance-error">
              {localError || previewError}
            </p>
          )}
          {save.isError && <FinanceError error={save.error} />}
          <div className="finance-actions">
            <Button
              type="submit"
              disabled={
                save.isPending || !codes.length || (editing !== null && editing.status !== 'DRAFT')
              }
            >
              <Save size={16} />
              {save.isPending ? 'Salvando…' : editing ? 'Salvar nova versão' : 'Salvar rascunho'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setForm({ simulationDate: today(), segment: 'ADVOCACIA', setupCents: '0,00' });
                setCodes([]);
              }}
            >
              Nova simulação
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!codes.length || !preview || check.isPending}
              onClick={() => check.mutate()}
            >
              Conferir no servidor
            </Button>
          </div>
          {check.isError && <FinanceError error={check.error} />}
          {check.isSuccess && (
            <p role="status">
              Cálculo conferido no servidor: {brl(check.data.monthlyCents)} / mês.
            </p>
          )}
        </form>
        <aside className="simulator-results">
          <h2>Resultado estimado</h2>
          <ResultPanel result={preview} current={current} />
        </aside>
      </div>
      <FinancePanel title="Catálogo dos quatro serviços">
        <div className="finance-catalog-grid">
          {catalog.data?.map((o) => (
            <article key={o.code} className="finance-service-card">
              <h3>{o.name}</h3>
              <p>{o.description}</p>
              <strong>
                {o.monthlyCents === null ? 'Preço não definido' : brl(o.monthlyCents) + ' / mês'}
              </strong>
              <small>
                Base: {o.baseCents === null ? 'Preço não definido' : brl(o.baseCents)} ·
                Implantação: {o.setupCents === null ? 'Preço não definido' : brl(o.setupCents)}
              </small>
              <span>{o.active ? 'Ativo' : 'Inativo'}</span>
              {owner && (
                <Button variant="outline" onClick={() => setPriceEdit(o)}>
                  Editar preços de {o.name}
                </Button>
              )}
              <details>
                <summary>Histórico de preços</summary>
                {o.priceHistory?.length ? (
                  o.priceHistory.map((v) => (
                    <p key={v.id}>
                      Versão {v.version}: {brl(v.snapshot.monthlyCents)} / mês
                    </p>
                  ))
                ) : (
                  <p>Nenhuma alteração registrada.</p>
                )}
              </details>
            </article>
          ))}
        </div>
      </FinancePanel>
      {owner && policy.data && (
        <DiscountEditor
          policy={policy.data}
          onSaved={() => {
            void client.invalidateQueries({ queryKey: ['finance-policy'] });
          }}
        />
      )}
      <FinancePanel title="Histórico de simulações e propostas">
        <p>
          Valores e regras são preservados por versão. Aceitar uma proposta não cria contrato,
          receita ou alteração automática no lead.
        </p>
        {history.isError && <FinanceError error={history.error} />}
        {!history.data?.length ? (
          <p>Nenhuma simulação salva.</p>
        ) : (
          <div className="finance-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Status</th>
                  <th>Proposta mensal</th>
                  <th>Versão</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.companyName}</td>
                    <td>{statusNames[p.status]}</td>
                    <td>{brl(p.result.monthlyCents)}</td>
                    <td>{p.version}</td>
                    <td>
                      <div className="finance-actions">
                        <Button variant="ghost" onClick={() => detail.mutate(p.id)}>
                          <History size={14} />
                          Ver proposta
                        </Button>
                        {p.status === 'DRAFT' && (
                          <Button variant="ghost" onClick={() => edit(p)}>
                            Editar rascunho
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={duplicate.isPending}
                          onClick={() => duplicate.mutate(p)}
                        >
                          <Copy size={14} />
                          Duplicar com regras atuais
                        </Button>
                        {(p.status === 'DRAFT'
                          ? ['PREPARED']
                          : p.status === 'PREPARED'
                            ? ['SENT', 'EXPIRED']
                            : p.status === 'SENT'
                              ? ['ACCEPTED', 'REJECTED', 'EXPIRED']
                              : []
                        ).map((state) => (
                          <Button
                            key={state}
                            variant="outline"
                            disabled={status.isPending}
                            onClick={() => status.mutate({ p, state })}
                          >
                            {statusNames[state]}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="finance-actions">
          <Button
            variant="outline"
            disabled={historyPage === 1}
            onClick={() => setHistoryPage(historyPage - 1)}
          >
            Anterior
          </Button>
          <span>Página {historyPage}</span>
          <Button
            variant="outline"
            disabled={(history.data?.length ?? 0) < 30}
            onClick={() => setHistoryPage(historyPage + 1)}
          >
            Próxima
          </Button>
        </div>
        {(status.isError || duplicate.isError || detail.isError) && (
          <FinanceError error={status.error || duplicate.error || detail.error} />
        )}
      </FinancePanel>
      {selectedVersion && (
        <FinancePanel title={'Proposta salva · ' + selectedVersion.companyName}>
          <p>
            Status {statusNames[selectedVersion.status]} · versão {selectedVersion.version}.
            Snapshot comercial preservado.
          </p>
          {view?.versions && (
            <label>
              Consultar versão
              <select
                value={versionView ?? view.version}
                onChange={(e) => setVersionView(Number(e.target.value))}
              >
                {view.versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    Versão {v.version}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ResultPanel
            result={selectedVersion.result}
            current={selectedVersion.input.currentCostCents}
          />
          <ul>
            {selectedVersion.result.offeringSnapshots.map((o) => (
              <li key={o.code}>
                {o.name}: {o.monthlyCents === null ? 'Preço não definido' : brl(o.monthlyCents)}
              </li>
            ))}
          </ul>
          <p>{selectedVersion.input.notes}</p>
        </FinancePanel>
      )}
      {priceEdit && (
        <FinanceForm
          title={'Editar ' + priceEdit.name}
          description="Somente OWNER. A alteração será auditada e não muda versões históricas de propostas."
          fields={prices}
          initial={priceEdit as unknown as Record<string, unknown>}
          onClose={() => setPriceEdit(null)}
          onSave={async (data) => {
            await authApi('/finance/catalog/' + priceEdit.code, 'PUT', {
              ...data,
              version: priceEdit.version,
            });
            await client.invalidateQueries({ queryKey: ['finance-catalog'] });
          }}
        />
      )}
    </section>
  );
}
