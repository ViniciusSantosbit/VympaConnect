import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { authApi } from '@/features/auth/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, LoadingState } from '@/components/shared/DashboardComponents';
import {
  FinanceError,
  FinancePanel,
  dateText,
  today,
  type Field,
} from '@/features/finance/finance-ui';
import {
  CommercialNav,
  Badge,
  Metric,
  Pager,
  ContractRows,
  codes,
  contractStates,
  names,
  options,
  useCommercial,
  money,
} from './commercial-ui';
import type { Listing, Client, Contract, Summary } from './commercial-ui';
function fields(
  clients: { value: string; label: string }[],
  responsibles: { value: string; label: string }[],
  owner: boolean,
  editing = false,
): Field[] {
  return [
    ...(!editing
      ? [
          {
            name: 'clientId',
            label: 'Cliente',
            kind: 'select' as const,
            required: true,
            options: clients,
          },
        ]
      : []),
    { name: 'number', label: 'Número do contrato', required: true },
    { name: 'title', label: 'Título', required: true },
    {
      name: 'responsibleId',
      label: 'Responsável',
      kind: 'select',
      required: true,
      options: responsibles,
    },
    { name: 'description', label: 'Descrição', kind: 'textarea' },
    { name: 'startsOn', label: 'Início da vigência', kind: 'date' },
    { name: 'endsOn', label: 'Término da vigência', kind: 'date' },
    {
      name: 'billingPeriod',
      label: 'Periodicidade de cobrança',
      kind: 'select',
      options: options(['MONTHLY', 'QUARTERLY', 'YEARLY', 'ONCE']),
      required: true,
    },
    ...(owner
      ? [
          { name: 'setupCents', label: 'Implantação (R$)', kind: 'money' as const },
          { name: 'monthlyCents', label: 'Mensalidade (R$)', kind: 'money' as const },
          { name: 'commercialTerms', label: 'Condições comerciais', kind: 'textarea' as const },
          { name: 'adjustmentTerms', label: 'Condições de reajuste', kind: 'textarea' as const },
        ]
      : []),
    ...codes.map((code) => ({ name: code, label: names[code]!, kind: 'checkbox' as const })),
    { name: 'notes', label: 'Observações', kind: 'textarea' },
  ];
}
function payload(d: Record<string, unknown>) {
  const serviceCodes = codes.filter((c) => d[c]);
  return {
    ...Object.fromEntries(Object.entries(d).filter(([k]) => !codes.includes(k))),
    serviceCodes,
  };
}
export function ContractsPage() {
  const ui = useCommercial(),
    [params] = useSearchParams(),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [days, setDays] = useState('30'),
    [clientSearch, setClientSearch] = useState('');
  const qs = new URLSearchParams({
    page: String(page),
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    ...(params.get('clientId') ? { clientId: params.get('clientId')! } : {}),
  });
  const list = useQuery({
    queryKey: ['commercial', 'contracts', qs.toString()],
    queryFn: () => authApi<Listing<Contract>>('/contracts?' + qs),
    retry: false,
  });
  const clients = useQuery({
    queryKey: ['commercial', 'client-options', clientSearch],
    queryFn: () => authApi<Listing<Client>>('/clients?query=' + encodeURIComponent(clientSearch)),
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['commercial', 'summary'],
    queryFn: () => authApi<Summary>('/contracts/summary'),
    retry: false,
  });
  const expiring = useQuery({
    queryKey: ['commercial', 'expiring', days],
    queryFn: () => authApi<Contract[]>('/contracts/expiring?days=' + days),
    retry: false,
  });
  function create() {
    ui.setDialog({
      title: 'Preparar rascunho contratual',
      description:
        'O contrato será salvo como rascunho. Revise valores, serviços e vigência antes da formalização.',
      fields: fields(
        (clients.data?.items ?? []).map((c) => ({ value: c.id, label: c.companyName })),
        ui.responsibles,
        ui.owner,
      ),
      initial: { clientId: params.get('clientId') ?? '', billingPeriod: 'MONTHLY' },
      save: (d) =>
        authApi('/contracts', 'POST', {
          ...payload(d),
          requestKey: ui.requestKey(),
          ...(ui.owner && params.get('proposalId') ? { proposalId: params.get('proposalId') } : {}),
        }),
    });
  }
  return (
    <section className="dashboard-page commercial-page">
      <CommercialNav />
      <PageHeader
        title="Contratos e Vigências"
        description="Organize acordos comerciais, documentos, valores, vencimentos e renovações."
      >
        <Button onClick={create}>
          <Plus size={16} /> Novo rascunho
        </Button>
      </PageHeader>
      {summary.data && (
        <div className="finance-metrics">
          <Metric label="Contratos ativos" value={summary.data.active} />
          <Metric label="Vencidos" value={summary.data.expired} />
          <Metric label="Aguardando assinatura" value={summary.data.pendingSignature} />
          <Metric label="Vencem em 30 dias" value={summary.data.expiring} />
          <Metric label="Renovações em rascunho" value={summary.data.renewals} />
          {ui.owner && (
            <Metric
              label="Valor mensal contratado"
              value={money(Number(summary.data.monthlyContractedCents))}
            />
          )}
        </div>
      )}
      <p>
        Valores contratados são previsões. Contratos assinados não representam pagamentos recebidos.{' '}
        {summary.data?.unpriced ? `${summary.data.unpriced} contrato(s) com valor indefinido.` : ''}
      </p>
      {params.get('proposalId') && (
        <FinancePanel title="Rascunho a partir de proposta aceita">
          <p>
            Selecione o cliente no novo rascunho. As condições e a versão da proposta serão
            preservadas para revisão.
          </p>
        </FinancePanel>
      )}
      <FinancePanel title="Selecionar empresa para novo rascunho">
        <Input
          aria-label="Pesquisar empresa para contrato"
          placeholder="Pesquisar cliente antes de abrir o formulário"
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
        />
        {clients.isError && <FinanceError error={clients.error} />}
        <small>
          O formulário oferece até 30 resultados desta pesquisa.{' '}
          <Link to="/clients">Cadastrar cliente</Link>
        </small>
      </FinancePanel>
      <FinancePanel title="Central de contratos">
        <div className="commercial-filters">
          <Input
            aria-label="Pesquisar contratos"
            placeholder="Número, título ou cliente"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Status contratual"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            {options(contractStates).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <FinanceError error={list.error} />
        ) : (
          <>
            <ContractRows rows={list.data.items} owner={ui.owner} />
            <Pager page={page} total={list.data.total} setPage={setPage} />
          </>
        )}
      </FinancePanel>
      <FinancePanel title="Próximos vencimentos">
        <label>
          Antecedência{' '}
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            {['30', '15', '7'].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </label>
        {expiring.isError ? (
          <FinanceError error={expiring.error} />
        ) : expiring.isPending ? (
          <LoadingState />
        ) : (
          <ContractRows rows={expiring.data} owner={ui.owner} />
        )}
      </FinancePanel>
      {summary.isError && <FinanceError error={summary.error} />}
      {ui.modal}
    </section>
  );
}
const transitions: Record<string, string[]> = {
  DRAFT: ['PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['DRAFT', 'SIGNED', 'CANCELLED'],
  SIGNED: ['ACTIVE', 'TERMINATED'],
  ACTIVE: ['EXPIRED', 'TERMINATED'],
};
export function ContractDetails() {
  const { id = '' } = useParams(),
    ui = useCommercial();
  const q = useQuery({
    queryKey: ['commercial', 'contract', id],
    queryFn: () => authApi<Contract>('/contracts/' + id),
    retry: false,
  });
  const docs = useQuery({
    queryKey: ['commercial', 'documents', id],
    queryFn: () =>
      authApi<{
        pending: string;
        items: { id: string; name: string; kind: string; storageStatus: string }[];
      }>('/contracts/' + id + '/documents'),
    retry: false,
  });
  const billing = useMutation({
    mutationFn: async () => {
      const categories = await authApi<{ id: string; name: string; active: boolean }[]>(
        '/finance/management/categories',
      );
      const contract = q.data!;
      ui.setDialog({
        title: 'Registrar cobrança prevista',
        description:
          'Criação manual de receita pendente. Não registra recebimento nem gera cobranças recorrentes.',
        fields: [
          { name: 'description', label: 'Descrição da cobrança', required: true },
          {
            name: 'billingReference',
            label: 'Referência da cobrança',
            required: true,
            hint: 'Use a mesma referência para a mesma cobrança; uma referência não pode ser registrada duas vezes.',
          },
          {
            name: 'categoryId',
            label: 'Categoria',
            kind: 'select',
            required: true,
            options: categories
              .filter((c) => c.active)
              .map((c) => ({ value: c.id, label: c.name })),
          },
          { name: 'amountCents', label: 'Valor (R$)', kind: 'money', required: true },
          { name: 'competenceOn', label: 'Competência', kind: 'date', required: true },
          { name: 'dueOn', label: 'Vencimento', kind: 'date', required: true },
        ],
        initial: {
          description: contract.number + ' · ' + contract.title,
          billingReference: contract.number + '/' + today().slice(0, 7),
          amountCents: contract.currentMonthlyCents ?? contract.monthlyCents,
          competenceOn: today(),
          dueOn: today(),
        },
        save: (d) =>
          authApi('/finance/management/transactions', 'POST', {
            ...d,
            requestKey: ui.requestKey(),
            type: 'INCOME',
            status: 'PENDING',
            clientId: contract.clientId,
            contractId: contract.id,
          }),
      });
    },
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <FinanceError error={q.error} />;
  const c = q.data;
  return (
    <section className="dashboard-page commercial-page">
      <CommercialNav />
      <PageHeader
        title={c.number + ' · ' + c.title}
        description={'Cliente: ' + c.client.companyName}
      />
      <Badge value={c.effectiveStatus ?? c.status} />
      <FinancePanel title="Visão geral">
        <Link to={'/clients/' + c.clientId}>Abrir cliente</Link>
        <dl className="commercial-data">
          {[
            ['Responsável', c.responsible.email],
            ['Início', dateText(c.startsOn)],
            ['Término', dateText(c.endsOn)],
            ['Periodicidade', names[c.billingPeriod]],
            ['Serviços', c.services.map((s) => names[s.code]).join(', ')],
            ['Descrição', c.description],
            ['Observações', c.notes],
            ...(ui.owner
              ? [
                  ['Implantação', money(c.setupCents)],
                  ['Mensalidade atual', money(c.currentMonthlyCents ?? c.monthlyCents)],
                  ['Condições comerciais', c.commercialTerms],
                  ['Reajustes', c.adjustmentTerms],
                ]
              : []),
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || 'Não informado'}</dd>
            </div>
          ))}
        </dl>
        {c.proposalId && (
          <p>
            Proposta de origem: {c.proposalId}
            {ui.owner && c.proposalSnapshot ? ' · Versão ' + c.proposalSnapshot.version : ''}
          </p>
        )}
        {c.renewedFromId && <Link to={'/contracts/' + c.renewedFromId}>Contrato anterior</Link>}
        <div className="finance-actions">
          {ui.owner && ['SIGNED', 'ACTIVE'].includes(c.status) && (
            <Button variant="outline" disabled={billing.isPending} onClick={() => billing.mutate()}>
              Registrar cobrança prevista
            </Button>
          )}
          {c.status === 'DRAFT' && (
            <Button
              onClick={() =>
                ui.setDialog({
                  title: 'Revisar rascunho',
                  fields: fields([], ui.responsibles, ui.owner, true).filter(
                    (f) => ui.owner || f.name !== 'number',
                  ),
                  initial: { ...c, ...Object.fromEntries(c.services.map((s) => [s.code, true])) },
                  save: (d) =>
                    authApi('/contracts/' + id, 'PATCH', { ...payload(d), version: c.version }),
                })
              }
            >
              Editar rascunho
            </Button>
          )}
          {ui.owner && (transitions[c.status]?.length ?? 0) > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                ui.setDialog({
                  title: 'Alterar status contratual',
                  description:
                    'Assinatura exige evidência ou confirmação administrativa. Este registro não substitui um serviço de assinatura eletrônica.',
                  fields: [
                    {
                      name: 'status',
                      label: 'Novo status',
                      kind: 'select',
                      required: true,
                      options: options(transitions[c.status]!),
                    },
                    { name: 'reason', label: 'Motivo', kind: 'textarea', required: true },
                    {
                      name: 'signatureEvidence',
                      label: 'Evidência ou confirmação de assinatura',
                      kind: 'textarea',
                      hint: 'Obrigatória ao marcar como assinado; indique o procedimento e a referência documental.',
                    },
                  ],
                  save: (d) =>
                    authApi('/contracts/' + id + '/status', 'PATCH', { ...d, version: c.version }),
                })
              }
            >
              Alterar status
            </Button>
          )}
          {ui.owner && ['SIGNED', 'ACTIVE'].includes(c.status) && (
            <Button
              variant="outline"
              onClick={() =>
                ui.setDialog({
                  title: 'Registrar aditivo de valor',
                  description:
                    'O valor anterior será preservado. A nova mensalidade será considerada a partir da data de vigência.',
                  fields: [
                    {
                      name: 'monthlyCents',
                      label: 'Nova mensalidade (R$)',
                      kind: 'money',
                      required: true,
                    },
                    {
                      name: 'effectiveOn',
                      label: 'Início do novo valor',
                      kind: 'date',
                      required: true,
                    },
                    { name: 'reason', label: 'Motivo / acordo', kind: 'textarea', required: true },
                    { name: 'indexName', label: 'Índice acordado (opcional)' },
                    {
                      name: 'percentBps',
                      label: 'Percentual em centésimos (100 = 1%)',
                      kind: 'number',
                      min: -10000,
                      max: 100000,
                    },
                    {
                      name: 'documentId',
                      label: 'Referência documental',
                      kind: 'select',
                      options: (docs.data?.items ?? []).map((d) => ({
                        value: d.id,
                        label: d.name,
                      })),
                    },
                  ],
                  initial: { effectiveOn: today() },
                  save: (d) =>
                    authApi('/contracts/' + id + '/amendments', 'POST', {
                      ...d,
                      version: c.version,
                      requestKey: ui.requestKey(),
                    }),
                })
              }
            >
              Registrar reajuste
            </Button>
          )}
          {ui.owner && ['ACTIVE', 'EXPIRED'].includes(c.status) && (
            <Button
              variant="outline"
              onClick={() =>
                ui.setDialog({
                  title: 'Preparar renovação',
                  description:
                    'Cria um novo rascunho para revisão e formalização posterior. Não renova o contrato automaticamente.',
                  fields: [
                    { name: 'number', label: 'Novo número', required: true },
                    {
                      name: 'startsOn',
                      label: 'Nova data de início',
                      kind: 'date',
                      required: true,
                    },
                    { name: 'endsOn', label: 'Nova data de término', kind: 'date', required: true },
                    { name: 'reason', label: 'Motivo', kind: 'textarea', required: true },
                  ],
                  save: (d) =>
                    authApi('/contracts/' + id + '/renewals', 'POST', {
                      ...d,
                      version: c.version,
                      requestKey: ui.requestKey(),
                    }),
                })
              }
            >
              Preparar renovação
            </Button>
          )}
        </div>
        {billing.isError && <FinanceError error={billing.error} />}
      </FinancePanel>
      {ui.owner && (
        <FinancePanel title="Histórico de valores e aditivos">
          <p>Valor inicial: {money(c.monthlyCents)} · valores preservados por vigência.</p>
          {c.amendments?.map((a) => (
            <article key={a.id}>
              <strong>A partir de {dateText(a.effectiveOn)}</strong>
              <p>
                {money(a.previousMonthlyCents)} → {money(a.monthlyCents)} · {a.reason}
              </p>
            </article>
          ))}
          {!c.amendments?.length && <p>Nenhum reajuste registrado.</p>}
        </FinancePanel>
      )}
      <FinancePanel title="Documentos privados">
        {docs.isError ? (
          <FinanceError error={docs.error} />
        ) : (
          <>
            <p>{docs.data?.pending}</p>
            <div className="finance-actions">
              <Button
                variant="outline"
                onClick={() =>
                  ui.setDialog({
                    title: 'Cadastrar referência documental',
                    description:
                      'Somente metadados. Nenhum arquivo será enviado ou disponibilizado para download.',
                    fields: [
                      { name: 'name', label: 'Nome do documento', required: true },
                      {
                        name: 'kind',
                        label: 'Formato previsto',
                        kind: 'select',
                        required: true,
                        options: options(['PDF', 'DOCX']),
                      },
                    ],
                    save: (d) => authApi('/contracts/' + id + '/documents', 'POST', d),
                  })
                }
              >
                Adicionar referência
              </Button>
              <Button disabled>Upload indisponível</Button>
            </div>
            {docs.data?.items.map((d) => (
              <p key={d.id}>
                {d.name} · {d.kind} · Aguardando armazenamento privado
              </p>
            ))}
          </>
        )}
      </FinancePanel>
      <FinancePanel title="Linha do tempo">
        <ol className="commercial-timeline">
          {c.history.map((h) => (
            <li key={h.id}>
              <strong>{h.kind}</strong>
              {h.reason && <p>{h.reason}</p>}
              <small>
                {dateText(h.createdAt)} · {h.actor.email}
              </small>
            </li>
          ))}
        </ol>
      </FinancePanel>
      {ui.modal}
    </section>
  );
}
