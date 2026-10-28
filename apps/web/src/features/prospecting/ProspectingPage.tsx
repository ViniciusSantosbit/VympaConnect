import { lazy, Suspense, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  MapPin,
  Search,
  Plus,
  LayoutList,
  Columns3,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import {
  brazilStates,
  leadSegments,
  segmentLabels,
  leadStatuses,
  statusLabels,
} from '@vympa/shared';
import type { ExternalPlace, LeadRecord, LeadStatus, LeadSegment } from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { prospectMessage as authMessage } from './prospecting-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, EmptyState } from '@/components/shared/DashboardComponents';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LeadDetails } from './LeadDetails';
import './prospecting.css';
const ProspectingMap = lazy(() => import('./ProspectingMap'));
type Filters = {
  segment: LeadSegment | '';
  region: string;
  state: string;
  city: string;
  query: string;
  status: string;
  assigneeId: string;
};
const empty: Filters = {
  segment: '',
  region: '',
  state: '',
  city: '',
  query: '',
  status: '',
  assigneeId: '',
};
type SearchResult = {
  places: ExternalPlace[];
  nextPageToken: string | null;
  references: {
    placeId: string;
    lead: { id: string; status: LeadStatus; assigneeId: string | null };
  }[];
};
const safeLink = (url: string | undefined) => {
  try {
    const u = new URL(url ?? '');
    return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};
export function ProspectingPage({ crm = false }: { crm?: boolean }) {
  const client = useQueryClient();
  const [view, setView] = useState<'map' | 'list' | 'kanban'>(crm ? 'kanban' : 'map');
  const [filters, setFilters] = useState<Filters>(empty);
  const [applied, setApplied] = useState<Filters>(empty);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [create, setCreate] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [googleContext, setGoogleContext] = useState<Filters & { minRating?: number }>(empty);
  const [place, setPlace] = useState<ExternalPlace | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [minRating, setMinRating] = useState('0');
  const params = new URLSearchParams(Object.entries(applied).filter(([, v]) => v));
  params.set('page', String(page));
  const leads = useQuery({
    queryKey: ['leads', applied, page],
    queryFn: () =>
      authApi<{ items: LeadRecord[]; total: number; pageSize: number }>(
        '/prospecting/leads?' + params,
      ),
    retry: false,
  });
  const owners = useQuery({
    queryKey: ['prospecting-assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
    retry: false,
  });
  const usage = useQuery({
    queryKey: ['places-usage'],
    queryFn: () =>
      authApi<{
        configured: boolean;
        hour: number;
        day: number;
        details: number;
        hourLimit: number;
        dayLimit: number;
      }>('/prospecting/usage'),
    retry: false,
  });
  const search = useMutation({
    mutationFn: (pageToken?: string) => {
      const context = pageToken ? googleContext : { ...filters, minRating: Number(minRating) };
      return authApi<SearchResult>('/prospecting/places/search', 'POST', {
        segment: context.segment || 'ADVOCACIA',
        region: context.region || undefined,
        state: context.state || undefined,
        city: context.city || undefined,
        query: context.query || undefined,
        minRating: context.minRating,
        pageToken,
      });
    },
    onMutate: (pageToken) => {
      if (!pageToken) setGoogleContext({ ...filters, minRating: Number(minRating) });
    },
    onSuccess: (data) => {
      setResults(data);
      setSelected(null);
      setPlace(null);
      void usage.refetch();
    },
    onSettled: () => {
      void usage.refetch();
    },
  });
  const references = useQuery({
    queryKey: ['place-references', results?.places.map((p) => p.id)],
    queryFn: () =>
      authApi<SearchResult['references']>('/prospecting/places/references', 'POST', {
        placeIds: results!.places.map((p) => p.id),
      }),
    enabled: !!results?.places.length,
    retry: false,
  });
  const linked = references.data ?? results?.references ?? [];
  const details = useMutation({
    mutationFn: (id: string) =>
      authApi<ExternalPlace>('/prospecting/places/' + encodeURIComponent(id) + '/details', 'POST'),
    onSuccess: (data) => {
      setPlace(data);
      setSelected(data.id);
    },
    onSettled: () => {
      void usage.refetch();
    },
  });
  const change = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: unknown;
      method?: string;
    }) => authApi<LeadRecord>('/prospecting/' + path, method, body),
    onSuccess: (data, variables) => {
      if (data.id && variables.path === 'leads') setLeadId(data.id);
      if (data.externalReference)
        setResults((previous) =>
          previous
            ? {
                ...previous,
                references: [
                  ...previous.references.filter(
                    (r) => r.placeId !== data.externalReference!.placeId,
                  ),
                  {
                    placeId: data.externalReference!.placeId,
                    lead: { id: data.id, status: data.status, assigneeId: data.assigneeId },
                  },
                ],
              }
            : previous,
        );
      setCreate(false);
      void client.invalidateQueries({ queryKey: ['leads'] });
      void client.invalidateQueries({ queryKey: ['place-references'] });
      void client.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
  function move(id: string, status: LeadStatus) {
    const lossReason =
      status === 'LOST' ? window.prompt('Motivo da perda (obrigatório):') : undefined;
    if (status === 'LOST' && !lossReason?.trim()) return;
    change.mutate({ path: `leads/${id}/status`, method: 'PATCH', body: { status, lossReason } });
  }
  const mapsConfigured =
    import.meta.env.VITE_GOOGLE_MAPS_ENABLED === 'true' &&
    !!import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY &&
    !!import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
  const statuses: Record<string, LeadStatus> = {};
  linked.forEach((r) => {
    statuses[r.placeId] = r.lead.status;
  });
  leads.data?.items.forEach((l) => {
    if (l.externalReference) statuses[l.externalReference.placeId] = l.status;
  });
  const shownPlaces =
    results?.places.filter((p) => {
      const ref = linked.find((r) => r.placeId === p.id);
      return (
        (!filters.status || (statuses[p.id] ?? 'NOT_CONTACTED') === filters.status) &&
        (!filters.assigneeId || ref?.lead.assigneeId === filters.assigneeId)
      );
    }) ?? [];
  const activePlace =
    place?.id === selected ? place : results?.places.find((p) => p.id === selected);
  function select(id: string) {
    setSelected(id);
    setPlace(null);
  }
  function filterField(key: keyof Filters, value: string) {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'region' ? { state: '', city: '' } : key === 'state' ? { city: '' } : {}),
    }));
  }
  return (
    <section className="dashboard-page prospecting-page">
      <PageHeader
        title={crm ? 'CRM comercial' : 'Central de prospecção'}
        description="Encontre oportunidades. Construa relacionamentos. Acompanhe o próximo passo."
      >
        <Button onClick={() => setCreate(true)}>
          <Plus size={16} />
          Novo lead
        </Button>
      </PageHeader>
      <div className="prospecting-toolbar">
        <div className="view-switch">
          {(['map', 'list', 'kanban'] as const).map((mode, i) => (
            <Button
              key={mode}
              variant={view === mode ? 'default' : 'ghost'}
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
            >
              {i === 0 ? (
                <MapPin size={15} />
              ) : i === 1 ? (
                <LayoutList size={15} />
              ) : (
                <Columns3 size={15} />
              )}{' '}
              {['Explorar mapa', 'Leads salvos', 'Kanban'][i]}
            </Button>
          ))}
        </div>
        <Button
          className="filter-toggle"
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={16} />
          Filtros
        </Button>
        <span className="usage-label">
          Places:{' '}
          {usage.data
            ? `${usage.data.hour}/${usage.data.hourLimit} nesta hora · ${usage.data.day}/${usage.data.dayLimit} no dia UTC`
            : 'uso não carregado'}
        </span>
      </div>
      {!usage.data?.configured && (
        <div className="integration-pending">
          <MapPin size={21} />
          <div>
            <strong>Integração Google pendente</strong>
            <p>
              O CRM está disponível. Busca e mapa precisam de chaves restritas e autorização de uso.
              Nenhuma consulta Google é feita ao abrir esta página.
            </p>
          </div>
        </div>
      )}
      <div className="prospecting-workspace">
        <aside className={`prospect-filters ${showFilters ? 'filters-open' : ''}`}>
          <h2>Refinar oportunidades</h2>
          <label>
            Segmento
            <select
              value={filters.segment}
              onChange={(e) => filterField('segment', e.target.value)}
            >
              <option value="">Todos (busca: Advocacia)</option>
              {leadSegments.map((s) => (
                <option key={s} value={s}>
                  {segmentLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Região
            <select value={filters.region} onChange={(e) => filterField('region', e.target.value)}>
              <option value="">Todo o Brasil</option>
              {['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select value={filters.state} onChange={(e) => filterField('state', e.target.value)}>
              <option value="">Todos os estados</option>
              {brazilStates
                .filter((s) => !filters.region || s[2] === filters.region)
                .map((s) => (
                  <option key={s[0]} value={s[0]}>
                    {s[1]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Cidade
            <Input
              value={filters.city}
              onChange={(e) => filterField('city', e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Pesquisa textual
            <Input
              value={filters.query}
              onChange={(e) => filterField('query', e.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            Avaliação mínima (Google)
            <select value={minRating} onChange={(e) => setMinRating(e.target.value)}>
              {['0', '3', '3.5', '4', '4.5'].map((v) => (
                <option key={v} value={v}>
                  {v === '0' ? 'Sem filtro' : `${v} estrelas`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status comercial
            <select value={filters.status} onChange={(e) => filterField('status', e.target.value)}>
              <option value="">Todos</option>
              {leadStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select
              value={filters.assigneeId}
              onChange={(e) => filterField('assigneeId', e.target.value)}
            >
              <option value="">Todos</option>
              {owners.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.email}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              setApplied(filters);
              setPage(1);
              setShowFilters(false);
            }}
          >
            Filtrar CRM
          </Button>
          <Button
            disabled={!usage.data?.configured || search.isPending}
            onClick={() => {
              search.mutate(undefined);
              setShowFilters(false);
            }}
          >
            <Search size={15} />
            {search.isPending ? 'Buscando…' : 'Buscar no Google'}
          </Button>
          <p className="prospect-note">
            Até 20 resultados por busca. Novas páginas e detalhes consomem chamadas. Status e
            responsável filtram vínculos locais; avaliação aplica-se somente à busca Google.
          </p>
          <a
            href="https://servicodados.ibge.gov.br/api/docs/localidades"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            UFs e regiões: IBGE
          </a>
        </aside>
        <div className="prospect-content">
          {(search.isError ||
            details.isError ||
            change.isError ||
            usage.isError ||
            owners.isError) && (
            <p role="alert">
              {authMessage(
                search.error || details.error || change.error || usage.error || owners.error,
              )}
            </p>
          )}
          {view === 'map' ? (
            <>
              <div className="map-workspace">
                <div className="map-canvas">
                  {mapLoaded ? (
                    <Suspense fallback={<p role="status">Carregando mapa…</p>}>
                      <ProspectingMap
                        places={shownPlaces}
                        selected={selected}
                        onSelect={select}
                        statuses={statuses}
                      />
                    </Suspense>
                  ) : (
                    <div className="map-placeholder">
                      <MapPin size={34} />
                      <h2>Explore o Brasil</h2>
                      <p>
                        O mapa usa Google Maps e é carregado apenas por sua ação. O carregamento
                        pode ser cobrado separadamente das buscas Places.
                      </p>
                      <Button disabled={!mapsConfigured} onClick={() => setMapLoaded(true)}>
                        Carregar mapa Google
                      </Button>
                      {!mapsConfigured && (
                        <small>Configure chave de navegador, Map ID e habilitação local.</small>
                      )}
                    </div>
                  )}
                </div>
                <div className="places-results">
                  <h2>Resultados da busca</h2>
                  {search.isPending ? (
                    <p role="status">Consultando Google…</p>
                  ) : results ? (
                    shownPlaces.length ? (
                      shownPlaces.map((p) => (
                        <button
                          className={`place-result ${selected === p.id ? 'active' : ''}`}
                          key={p.id}
                          onClick={() => select(p.id)}
                        >
                          <strong>{p.displayName?.text ?? 'Nome indisponível'}</strong>
                          <span>{p.formattedAddress ?? 'Endereço não informado'}</span>
                          <small
                            className={`status-badge status-${statuses[p.id] ?? 'NOT_CONTACTED'}`}
                          >
                            {statusLabels[statuses[p.id] ?? 'NOT_CONTACTED']}
                          </small>
                        </button>
                      ))
                    ) : (
                      <p>
                        Nenhum resultado para os filtros. O Google não garante cobertura completa.
                      </p>
                    )
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="Sua próxima oportunidade"
                      description="Escolha uma localização e inicie uma busca. Não há varreduras automáticas."
                    />
                  )}
                  {results?.nextPageToken && (
                    <Button
                      variant="outline"
                      disabled={search.isPending}
                      onClick={() => search.mutate(results.nextPageToken!)}
                    >
                      Próxima página Google
                    </Button>
                  )}
                  {results && <GoogleCredit places={results.places} />}
                </div>
              </div>
              {activePlace && (
                <div className="place-panel">
                  <div>
                    <h2>{activePlace.displayName?.text ?? 'Nome indisponível'}</h2>
                    <span>{segmentLabels[googleContext.segment || 'ADVOCACIA']}</span>
                    <p>{activePlace.formattedAddress ?? 'Endereço indisponível'}</p>
                    {safeLink(activePlace.googleMapsUri) && (
                      <a
                        className="text-link"
                        href={safeLink(activePlace.googleMapsUri)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir Google Maps <ExternalLink size={13} />
                      </a>
                    )}
                    <p>
                      Telefone:{' '}
                      {activePlace.nationalPhoneNumber ?? 'Não consultado ou não disponível'}
                    </p>
                    {safeLink(activePlace.websiteUri) && (
                      <a
                        href={safeLink(activePlace.websiteUri)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        Site informado pelo Google
                      </a>
                    )}
                    <p>
                      Avaliação:{' '}
                      {activePlace.rating !== undefined
                        ? `${activePlace.rating} / 5 (${activePlace.userRatingCount !== undefined ? activePlace.userRatingCount + ' avaliações' : 'quantidade não informada'})`
                        : 'Não consultada ou não disponível'}
                    </p>
                    <Button
                      variant="outline"
                      disabled={details.isPending}
                      onClick={() => details.mutate(activePlace.id)}
                    >
                      Consultar detalhes Google (pode gerar custo)
                    </Button>
                  </div>
                  <div>
                    <p>
                      Somente o Place ID será salvo; nome, endereço e telefone do Google não serão
                      copiados.
                    </p>
                    {linked.find((r) => r.placeId === activePlace.id) ? (
                      <Button
                        onClick={() =>
                          setLeadId(linked.find((r) => r.placeId === activePlace.id)!.lead.id)
                        }
                      >
                        Abrir lead no CRM
                      </Button>
                    ) : (
                      <Button
                        disabled={change.isPending}
                        onClick={() =>
                          change.mutate({
                            path: 'leads',
                            body: {
                              placeId: activePlace.id,
                              segment: googleContext.segment || 'ADVOCACIA',
                              region: googleContext.region || undefined,
                              state: googleContext.state || undefined,
                              city: googleContext.city || undefined,
                            },
                          })
                        }
                      >
                        Adicionar à prospecção
                      </Button>
                    )}
                  </div>
                  <GoogleCredit places={[activePlace]} />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="crm-heading">
                <h2>{view === 'kanban' ? 'Funil comercial' : 'Leads da VYMPA'}</h2>
                <span>
                  {leads.data?.total ?? '—'} leads · página {page} · até 30 por página
                </span>
              </div>
              {leads.isPending ? (
                <p role="status">Carregando leads…</p>
              ) : leads.isError ? (
                <div role="alert">
                  <p>{authMessage(leads.error)}</p>
                  <Button
                    onClick={() => {
                      void leads.refetch();
                    }}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : !leads.data?.items.length ? (
                <EmptyState
                  title="Nenhum lead cadastrado"
                  description="Adicione uma oportunidade manualmente ou selecione um estabelecimento na busca Google."
                />
              ) : view === 'list' ? (
                <div className="leads-list">
                  {leads.data.items.map((l) => (
                    <button key={l.id} className="lead-row" onClick={() => setLeadId(l.id)}>
                      <span>
                        <strong>
                          {l.companyName ??
                            `Referência Google · ${l.externalReference?.placeId.slice(0, 12) ?? l.id.slice(0, 8)}`}
                        </strong>
                        <small>
                          {segmentLabels[l.segment]} ·{' '}
                          {[l.city, l.state].filter(Boolean).join(' / ') ||
                            'Localização própria não informada'}
                        </small>
                      </span>
                      <span className={`status-badge status-${l.status}`}>
                        {statusLabels[l.status]}
                      </span>
                      <span>{l.assignee?.email ?? 'Sem responsável'}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="kanban-board" aria-label="Funil comercial">
                  {leadStatuses.map((s) => (
                    <section
                      className={`kanban-column status-${s}`}
                      key={s}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/lead-id');
                        if (leads.data?.items.some((l) => l.id === id)) move(id, s);
                      }}
                    >
                      <h3>
                        <i />
                        {statusLabels[s]}
                        <span>{leads.data.items.filter((l) => l.status === s).length}</span>
                      </h3>
                      {leads.data.items
                        .filter((l) => l.status === s)
                        .map((l) => (
                          <article
                            draggable
                            key={l.id}
                            onDragStart={(e) => e.dataTransfer.setData('text/lead-id', l.id)}
                            className="kanban-card"
                          >
                            <button onClick={() => setLeadId(l.id)}>
                              <strong>
                                {l.companyName ??
                                  `Place ID · ${l.externalReference?.placeId.slice(0, 12) ?? l.id.slice(0, 8)}`}
                              </strong>
                              <small>{segmentLabels[l.segment]}</small>
                            </button>
                            <p>{l.assignee?.email ?? 'Sem responsável'}</p>
                            <label className="sr-only" htmlFor={`status-${l.id}`}>
                              Mover {l.companyName ?? 'lead'}
                            </label>
                            <select
                              id={`status-${l.id}`}
                              value={l.status}
                              disabled={change.isPending}
                              onChange={(e) => move(l.id, e.target.value as LeadStatus)}
                            >
                              {leadStatuses.map((value) => (
                                <option key={value} value={value}>
                                  {statusLabels[value]}
                                </option>
                              ))}
                            </select>
                          </article>
                        ))}
                      {!leads.data.items.some((l) => l.status === s) && (
                        <p className="column-empty">Nenhum lead nesta página</p>
                      )}
                    </section>
                  ))}
                </div>
              )}
              <div className="crm-pagination">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={!leads.data || page * 30 >= leads.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima página CRM
                </Button>
              </div>
              <p className="prospect-note">
                Status WON indica negociação ganha. Nenhum contrato é gerado automaticamente. O
                Kanban exibe a página atual, respeitando os filtros.
              </p>
            </>
          )}
        </div>
      </div>
      <p className="prospect-note">
        Dados próprios e dados Google são separados. <Link to="/crm">Abrir CRM</Link> ·{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Privacidade Google
        </a>{' '}
        ·{' '}
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">
          Termos Google Maps
        </a>
      </p>
      {leadId && (
        <LeadDetails id={leadId} onClose={() => setLeadId(null)} assignees={owners.data ?? []} />
      )}
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogTitle>Novo lead próprio</DialogTitle>
          <DialogDescription>
            Cadastre apenas dados obtidos legitimamente. Não copie conteúdo do Google.
          </DialogDescription>
          <form
            className="lead-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              change.mutate({
                path: 'leads',
                body: {
                  companyName: f.get('companyName'),
                  segment: f.get('segment'),
                  region: filters.region || undefined,
                  state: filters.state || undefined,
                  city: filters.city || undefined,
                },
              });
            }}
          >
            <label>
              Nome da empresa
              <Input name="companyName" required minLength={2} maxLength={180} />
            </label>
            <label>
              Segmento
              <select name="segment" defaultValue={filters.segment || 'ADVOCACIA'}>
                {leadSegments.map((s) => (
                  <option key={s} value={s}>
                    {segmentLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={change.isPending}>
              Cadastrar lead
            </Button>
            {change.isError && <p role="alert">{authMessage(change.error)}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function GoogleCredit({ places }: { places: ExternalPlace[] }) {
  const credits = places.flatMap((p) => p.attributions ?? []);
  return (
    <div className="google-credit">
      <img
        src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
        alt="Powered by Google"
        width="120"
        height="14"
      />
      {credits.map((a, i) => (
        <span key={i}>
          {safeLink(a.providerUri) ? (
            <a href={safeLink(a.providerUri)} target="_blank" rel="noreferrer">
              {a.provider}
            </a>
          ) : (
            a.provider
          )}
        </span>
      ))}
    </div>
  );
}
