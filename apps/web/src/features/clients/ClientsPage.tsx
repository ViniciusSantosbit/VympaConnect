import { useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { authApi } from '@/features/auth/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, LoadingState } from '@/components/shared/DashboardComponents';
import { FinanceError, FinancePanel, dateText } from '@/features/finance/finance-ui';
import {
  Badge,
  CommercialNav,
  ContractRows,
  Metric,
  Pager,
  clientFields,
  clientStates,
  contactFields,
  options,
  names,
  useCommercial,
  money,
} from './commercial-ui';
import type { Client, Contact, Contract, Listing, Summary } from './commercial-ui';
export function ClientsPage() {
  const ui = useCommercial(),
    navigate = useNavigate(),
    [params] = useSearchParams(),
    leadId = params.get('leadId');
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [segment, setSegment] = useState(''),
    [page, setPage] = useState(1),
    [conversion, setConversion] = useState(!!leadId);
  const qs = new URLSearchParams({
    page: String(page),
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    ...(segment ? { segment } : {}),
  });
  const list = useQuery({
    queryKey: ['commercial', 'clients', qs.toString()],
    queryFn: () => authApi<Listing<Client>>('/clients?' + qs),
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['commercial', 'summary'],
    queryFn: () => authApi<Summary>('/contracts/summary'),
    retry: false,
  });
  function create() {
    ui.setDialog({
      title: 'Cadastrar cliente',
      fields: clientFields(ui.responsibles),
      save: (d) => authApi('/clients', 'POST', d),
    });
  }
  return (
    <section className="dashboard-page commercial-page">
      <CommercialNav />
      <PageHeader
        title="Clientes VYMPA"
        description="Gerencie empresas contratantes, serviços, responsáveis e o histórico de relacionamento."
      >
        <Button onClick={create}>
          <Plus size={16} /> Novo cliente
        </Button>
      </PageHeader>
      {summary.data && (
        <div className="finance-metrics">
          <Metric label="Clientes cadastrados" value={summary.data.totalClients} />
          <Metric label="Relacionamento ativo" value={summary.data.activeClients} />
          <Metric label="Em implantação" value={summary.data.onboarding} />
        </div>
      )}
      {conversion && leadId && (
        <FinancePanel title="Converter lead em cliente">
          <p>
            O lead e suas notas serão preservados. Se houver CNPJ correspondente, o cadastro será
            vinculado. Confira também os clientes existentes antes de criar uma empresa sem CNPJ.
          </p>
          <Button
            onClick={() =>
              ui.setDialog({
                title: 'Criar ou vincular cliente do CRM',
                fields: [
                  { name: 'companyName', label: 'Nome empresarial (para novo cadastro)' },
                  { name: 'cnpj', label: 'CNPJ (opcional)' },
                ],
                save: async (d) => {
                  const c = await authApi<Client>('/clients/from-lead/' + leadId, 'POST', d);
                  setConversion(false);
                  navigate('/clients/' + c.id);
                },
              })
            }
          >
            Revisar conversão
          </Button>
          <Button variant="outline" onClick={() => setConversion(false)}>
            Fechar
          </Button>
        </FinancePanel>
      )}
      <FinancePanel title="Empresas">
        <div className="commercial-filters">
          <Input
            aria-label="Pesquisar clientes"
            placeholder="Nome, nome fantasia ou CNPJ"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Status do cliente"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            {options(clientStates).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por segmento"
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os segmentos</option>
            {options(['ADVOCACIA', 'CONTABILIDADE', 'IMOBILIARIO']).map((o) => (
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
            <div className="finance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Segmento</th>
                    <th>Status</th>
                    <th>Responsável</th>
                    {conversion && <th>Conversão</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={'/clients/' + c.id}>
                          <Building2 size={15} /> {c.companyName}
                        </Link>
                        <small>{c.cnpj ?? 'CNPJ não informado'}</small>
                      </td>
                      <td>{names[c.segment]}</td>
                      <td>
                        <Badge value={c.status} />
                      </td>
                      <td>{c.responsible.email}</td>
                      {conversion && (
                        <td>
                          <Button
                            variant="outline"
                            onClick={() =>
                              ui.setDialog({
                                title: 'Vincular lead a ' + c.companyName,
                                description:
                                  'Mantém o cadastro atual e preserva o histórico do CRM.',
                                fields: [],
                                save: async () => {
                                  await authApi('/clients/from-lead/' + leadId, 'POST', {
                                    clientId: c.id,
                                  });
                                  navigate('/clients/' + c.id);
                                },
                              })
                            }
                          >
                            Vincular
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!list.data.items.length && (
                <p>Nenhum cliente encontrado. Cadastre uma empresa ou converta um lead do CRM.</p>
              )}
            </div>
            <Pager page={page} total={list.data.total} setPage={setPage} />
          </>
        )}
      </FinancePanel>
      {ui.modal}
    </section>
  );
}
const transitions: Record<string, string[]> = {
  PROSPECT: ['ONBOARDING', 'INACTIVE'],
  ONBOARDING: ['ACTIVE', 'SUSPENDED', 'INACTIVE'],
  ACTIVE: ['SUSPENDED', 'INACTIVE'],
  SUSPENDED: ['ONBOARDING', 'ACTIVE', 'INACTIVE'],
  INACTIVE: ['PROSPECT', 'ONBOARDING'],
};
export function ClientDetails() {
  const { id = '' } = useParams(),
    ui = useCommercial(),
    [tab, setTab] = useState('overview'),
    [activityPage, setActivityPage] = useState(1);
  const q = useQuery({
    queryKey: ['commercial', 'client', id],
    queryFn: () => authApi<Client>('/clients/' + id),
    retry: false,
  });
  const contracts = useQuery({
    queryKey: ['commercial', 'client-contracts', id],
    queryFn: () => authApi<Listing<Contract>>('/clients/' + id + '/contracts'),
    enabled: tab === 'contracts',
    retry: false,
  });
  const activity = useQuery({
    queryKey: ['commercial', 'client-activity', id, activityPage],
    queryFn: () =>
      authApi<
        { id: string; kind: string; body: string; createdAt: string; actor: { email: string } }[]
      >('/clients/' + id + '/activity?page=' + activityPage),
    enabled: tab === 'history',
    retry: false,
  });
  const finance = useQuery({
    queryKey: ['commercial', 'client-financial', id],
    queryFn: () =>
      authApi<{
        note: string;
        transactions: { status: string; type: string; _sum: { amountCents: number } }[];
      }>('/clients/' + id + '/financial'),
    enabled: tab === 'financial' && ui.owner,
    retry: false,
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <FinanceError error={q.error} />;
  const c = q.data;
  function contact(old?: Contact) {
    ui.setDialog({
      title: old ? 'Editar contato' : 'Novo contato empresarial',
      description: 'Registre apenas dados profissionais necessários ao relacionamento.',
      fields: contactFields,
      initial: old ? { ...old } : undefined,
      save: (d) =>
        authApi(
          '/clients/' + id + '/contacts' + (old ? '/' + old.id : ''),
          old ? 'PATCH' : 'POST',
          { ...d, ...(old ? { version: old.version } : {}) },
        ),
    });
  }
  return (
    <section className="dashboard-page commercial-page">
      <CommercialNav />
      <PageHeader
        title={c.companyName}
        description={`${names[c.segment]} · Cadastrado em ${dateText(c.createdAt)}`}
      >
        <Button
          variant="outline"
          onClick={() =>
            ui.setDialog({
              title: 'Editar empresa',
              fields: clientFields(ui.responsibles),
              initial: { ...c },
              save: (d) => authApi('/clients/' + id, 'PATCH', { ...d, version: c.version }),
            })
          }
        >
          Editar cadastro
        </Button>
      </PageHeader>
      <Badge value={c.status} />
      <nav className="commercial-tabs" aria-label="Detalhes do cliente">
        {[
          ['overview', 'Visão geral'],
          ['contacts', 'Contatos'],
          ['services', 'Serviços'],
          ['contracts', 'Contratos'],
          ...(ui.owner ? [['financial', 'Financeiro']] : []),
          ['history', 'Histórico'],
        ].map(([v, l]) => (
          <Button key={v} variant={tab === v ? 'default' : 'outline'} onClick={() => setTab(v!)}>
            {l}
          </Button>
        ))}
      </nav>
      {tab === 'overview' && (
        <FinancePanel title="Dados empresariais">
          <dl className="commercial-data">
            {[
              ['Nome fantasia', c.tradeName],
              ['CNPJ', c.cnpj],
              ['Responsável', c.responsible.email],
              ['E-mail', c.email],
              ['Telefone', c.phone],
              ['Website', c.website],
              ['Endereço', c.address],
              ['Cidade / UF', [c.city, c.state].filter(Boolean).join(' / ')],
              ['CEP', c.postalCode],
              ['Observações', c.notes],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || 'Não informado'}</dd>
              </div>
            ))}
          </dl>
          {ui.owner && (
            <Button
              variant="outline"
              onClick={() =>
                ui.setDialog({
                  title: 'Alterar relacionamento',
                  fields: [
                    {
                      name: 'status',
                      label: 'Novo status',
                      kind: 'select',
                      required: true,
                      options: options(transitions[c.status] ?? []),
                    },
                    { name: 'reason', label: 'Motivo', kind: 'textarea', required: true },
                  ],
                  save: (d) =>
                    authApi('/clients/' + id + '/status', 'PATCH', { ...d, version: c.version }),
                })
              }
            >
              Alterar status
            </Button>
          )}
          <h3>Origem comercial</h3>
          {c.leads.map((l) => (
            <p key={l.id}>
              <Link to={'/crm?leadId=' + l.id}>
                {l.companyName ?? 'Lead original'} · {l.id}
              </Link>
            </p>
          ))}
          {!c.leads.length && <p>Cadastro sem lead de origem.</p>}
        </FinancePanel>
      )}
      {tab === 'contacts' && (
        <FinancePanel title="Contatos empresariais">
          <Button onClick={() => contact()}>Adicionar contato</Button>
          {c.contacts.map((v) => (
            <article key={v.id} className="commercial-contact">
              <strong>
                {v.name} {v.primary && '· Principal'}
              </strong>
              <p>
                {v.position} · {v.email ?? '—'} · {v.phone ?? '—'}
              </p>
              <p>{v.notes}</p>
              <Button variant="outline" onClick={() => contact(v)}>
                Editar contato
              </Button>
            </article>
          ))}
          {!c.contacts.length && <p>Nenhum contato cadastrado.</p>}
        </FinancePanel>
      )}
      {tab === 'services' && (
        <FinancePanel title="Serviços e implantação">
          <p>O acompanhamento operacional não formaliza contratos nem gera cobranças.</p>
          {c.services.map((s) => (
            <p key={s.code}>
              {names[s.code]} · <Badge value={s.status} /> {s.notes}
            </p>
          ))}
          {!c.services.length && <p>Nenhum serviço relacionado.</p>}
          <Button
            onClick={() =>
              ui.setDialog({
                title: 'Atualizar implantação',
                fields: [
                  {
                    name: 'code',
                    label: 'Operação VYMPA',
                    kind: 'select',
                    required: true,
                    options: options([
                      'CUSTOM_AI',
                      'DOCUMENT_AUTOMATION',
                      'SECTOR_PROCESSES',
                      'AI_INTEGRATION',
                    ]),
                  },
                  {
                    name: 'status',
                    label: 'Implantação',
                    kind: 'select',
                    required: true,
                    options: options(['PLANNED', 'IMPLEMENTING', 'LIVE', 'SUSPENDED', 'ENDED']),
                  },
                  { name: 'notes', label: 'Observações', kind: 'textarea' },
                ],
                save: (d) =>
                  authApi('/clients/' + id + '/services', 'POST', { ...d, version: c.version }),
              })
            }
          >
            Registrar serviço
          </Button>
        </FinancePanel>
      )}
      {tab === 'contracts' && (
        <FinancePanel title="Contratos e vigências">
          <Link to={'/contracts?clientId=' + id}>Preparar contrato para esta empresa</Link>
          {contracts.isError ? (
            <FinanceError error={contracts.error} />
          ) : contracts.isPending ? (
            <LoadingState />
          ) : (
            <ContractRows rows={contracts.data.items} owner={ui.owner} />
          )}
        </FinancePanel>
      )}
      {tab === 'financial' && ui.owner && (
        <FinancePanel title="Financeiro relacionado">
          <p>Valores contratados e caixa recebido são apresentados separadamente.</p>
          {finance.isError ? (
            <FinanceError error={finance.error} />
          ) : finance.isPending ? (
            <LoadingState />
          ) : (
            <>
              <p>{finance.data.note}</p>
              {finance.data.transactions.map((g, i) => (
                <p key={i}>
                  {g.type === 'INCOME' ? 'Receita' : 'Despesa'} · {g.status}:{' '}
                  {money(g._sum.amountCents)}
                </p>
              ))}
              {!finance.data.transactions.length && <p>Nenhum lançamento financeiro vinculado.</p>}
              <Link to="/finance/management">Abrir gestão financeira</Link>
            </>
          )}
        </FinancePanel>
      )}
      {tab === 'history' && (
        <FinancePanel title="Histórico de relacionamento">
          <Button
            onClick={() =>
              ui.setDialog({
                title: 'Registrar interação',
                fields: [{ name: 'body', label: 'Interação', kind: 'textarea', required: true }],
                save: (d) => authApi('/clients/' + id + '/activity', 'POST', d),
              })
            }
          >
            Registrar interação
          </Button>
          {activity.isError ? (
            <FinanceError error={activity.error} />
          ) : activity.isPending ? (
            <LoadingState />
          ) : (
            <>
              <ol className="commercial-timeline">
                {activity.data.map((e) => (
                  <li key={e.id}>
                    <strong>{e.kind}</strong>
                    <p>{e.body}</p>
                    <small>
                      {dateText(e.createdAt)} · {e.actor.email}
                    </small>
                  </li>
                ))}
              </ol>
              {!activity.data.length && <p>Nenhum evento nesta página.</p>}
              <div className="finance-actions">
                <Button
                  variant="outline"
                  disabled={activityPage === 1}
                  onClick={() => setActivityPage(activityPage - 1)}
                >
                  Anterior
                </Button>
                <span>Página {activityPage}</span>
                <Button
                  variant="outline"
                  disabled={activity.data.length < 30}
                  onClick={() => setActivityPage(activityPage + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </FinancePanel>
      )}
      {ui.modal}
    </section>
  );
}
