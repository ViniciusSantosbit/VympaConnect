import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/features/auth/auth-api';
import { useAuth } from '@/features/auth/AuthProvider';
import { FinanceForm, type Field } from '@/features/finance/finance-ui';
import { Button } from '@/components/ui/button';
import { brl } from '@vympa/shared';
import '@/features/finance/finance.css';
import './commercial.css';
export const clientStates = ['PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];
export const contractStates = [
  'DRAFT',
  'PENDING_SIGNATURE',
  'SIGNED',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
];
export const names: Record<string, string> = {
  PROSPECT: 'Potencial cliente',
  ONBOARDING: 'Em implantação',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  INACTIVE: 'Inativo',
  DRAFT: 'Rascunho',
  PENDING_SIGNATURE: 'Aguardando assinatura',
  SIGNED: 'Assinado',
  EXPIRED: 'Vencido',
  TERMINATED: 'Encerrado',
  CANCELLED: 'Cancelado',
  ADVOCACIA: 'Advocacia',
  CONTABILIDADE: 'Contabilidade',
  IMOBILIARIO: 'Imobiliário',
  PLANNED: 'Planejado',
  IMPLEMENTING: 'Em implantação',
  LIVE: 'Em operação',
  ENDED: 'Encerrado',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
  ONCE: 'Única',
  CUSTOM_AI: 'Sistemas personalizados com IA',
  DOCUMENT_AUTOMATION: 'Automação de documentos',
  SECTOR_PROCESSES: 'Gestão de processos por setor',
  AI_INTEGRATION: 'IA em sistemas existentes',
};
export const codes = ['CUSTOM_AI', 'DOCUMENT_AUTOMATION', 'SECTOR_PROCESSES', 'AI_INTEGRATION'];
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: names[value] ?? value }));
export const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  );
export const money = (v: number | null | undefined) => (v == null ? 'Não definido' : brl(v));
export type Listing<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Contact = {
  id: string;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
  preferredChannel?: string;
  notes?: string;
  primary: boolean;
  version: number;
};
export type Client = {
  id: string;
  companyName: string;
  tradeName?: string;
  cnpj?: string;
  segment: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
  status: string;
  responsibleId: string;
  responsible: { id: string; email: string };
  version: number;
  createdAt: string;
  contacts: Contact[];
  services: { code: string; status: string; notes?: string }[];
  leads: { id: string; companyName?: string; status: string }[];
};
export type Contract = {
  id: string;
  number: string;
  title: string;
  description?: string;
  clientId: string;
  client: { id: string; companyName: string };
  responsibleId: string;
  responsible: { email: string };
  requestKey: string;
  status: string;
  effectiveStatus: string;
  startsOn?: string;
  endsOn?: string;
  setupCents?: number;
  monthlyCents?: number;
  currentMonthlyCents?: number;
  billingPeriod: string;
  commercialTerms?: string;
  adjustmentTerms?: string;
  notes?: string;
  signatureEvidence?: string;
  proposalId?: string;
  proposalSnapshot?: { version: number };
  renewedFromId?: string;
  version: number;
  services: { code: string }[];
  amendments?: {
    id: string;
    effectiveOn: string;
    previousMonthlyCents: number;
    monthlyCents: number;
    reason: string;
  }[];
  history: {
    id: string;
    kind: string;
    reason?: string;
    createdAt: string;
    actor: { email: string };
  }[];
};
export type Summary = {
  totalClients: number;
  activeClients: number;
  onboarding: number;
  active: number;
  expired: number;
  pendingSignature: number;
  expiring: number;
  renewals: number;
  monthlyContractedCents: string | null;
  unpriced: number | null;
};
export function useCommercial() {
  const requestKeyRef = useRef('');
  const qc = useQueryClient(),
    { session } = useAuth();
  const [dialog, setDialogState] = useState<{
    title: string;
    description?: string;
    fields: Field[];
    initial?: Record<string, unknown>;
    save: (d: Record<string, unknown>) => Promise<unknown>;
  } | null>(null);
  const setDialog = (value: typeof dialog) => {
    requestKeyRef.current = crypto.randomUUID();
    setDialogState(value);
  };
  const assignees = useQuery({
    queryKey: ['assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['commercial'] }),
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      qc.invalidateQueries({ queryKey: ['finance-management'] }),
    ]);
  };
  const modal = dialog ? (
    <FinanceForm
      title={dialog.title}
      description={dialog.description ?? 'Revise os dados antes de salvar.'}
      fields={dialog.fields}
      initial={dialog.initial}
      onClose={() => setDialog(null)}
      onSave={async (d) => {
        const r = await dialog.save(clean(d));
        await refresh();
        return r;
      }}
    />
  ) : null;
  return {
    owner: session?.role === 'OWNER',
    setDialog,
    requestKey: () => requestKeyRef.current,
    modal,
    refresh,
    assignees: assignees.data ?? [],
    responsibles: (assignees.data ?? []).map((a) => ({ value: a.id, label: a.email })),
  };
}
export function CommercialNav() {
  return (
    <nav className="finance-back">
      <Link to="/clients">Clientes</Link>
      <span>/</span>
      <Link to="/contracts">Contratos</Link>
      <span>/</span>
      <Link to="/crm">CRM</Link>
    </nav>
  );
}
export function Badge({ value }: { value: string }) {
  return <span className={'commercial-badge state-' + value}>{names[value] ?? value}</span>;
}
export function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (p: number) => void;
}) {
  return (
    <nav className="finance-actions" aria-label="Paginação">
      <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
        Anterior
      </Button>
      <span>
        Página {page} · {total} registros
      </span>
      <Button variant="outline" disabled={page * 30 >= total} onClick={() => setPage(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}
export function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="finance-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
export const clientFields = (responsibles: { value: string; label: string }[]): Field[] => [
  { name: 'companyName', label: 'Nome empresarial', required: true },
  { name: 'tradeName', label: 'Nome fantasia' },
  { name: 'cnpj', label: 'CNPJ', hint: 'Opcional; validado quando informado.' },
  {
    name: 'segment',
    label: 'Segmento',
    kind: 'select',
    required: true,
    options: options(['ADVOCACIA', 'CONTABILIDADE', 'IMOBILIARIO']),
  },
  {
    name: 'responsibleId',
    label: 'Responsável interno',
    kind: 'select',
    required: true,
    options: responsibles,
  },
  { name: 'email', label: 'E-mail corporativo' },
  { name: 'phone', label: 'Telefone comercial' },
  { name: 'website', label: 'Website', hint: 'Inclua https://' },
  { name: 'address', label: 'Endereço' },
  { name: 'city', label: 'Cidade' },
  { name: 'state', label: 'Estado (UF)' },
  { name: 'postalCode', label: 'CEP' },
  { name: 'notes', label: 'Observações', kind: 'textarea' },
];
export const contactFields: Field[] = [
  { name: 'name', label: 'Nome', required: true },
  { name: 'position', label: 'Cargo' },
  { name: 'email', label: 'E-mail' },
  { name: 'phone', label: 'Telefone' },
  {
    name: 'preferredChannel',
    label: 'Canal preferencial',
    kind: 'select',
    options: options(['EMAIL', 'PHONE', 'WHATSAPP', 'OTHER']),
  },
  { name: 'notes', label: 'Observações', kind: 'textarea' },
  { name: 'primary', label: 'Contato principal', kind: 'checkbox' },
];
export function ContractRows({ rows, owner }: { rows: Contract[]; owner: boolean }) {
  return (
    <div className="finance-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contrato / cliente</th>
            <th>Status</th>
            <th>Vigência</th>
            {owner && <th>Mensalidade</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={'/contracts/' + c.id}>
                  {c.number} · {c.title}
                </Link>
                <small>{c.client.companyName}</small>
              </td>
              <td>
                <Badge value={c.effectiveStatus ?? c.status} />
              </td>
              <td>
                {c.startsOn?.slice(0, 10) ?? '—'} → {c.endsOn?.slice(0, 10) ?? 'Sem término'}
              </td>
              {owner && (
                <td>
                  {money(c.currentMonthlyCents ?? c.monthlyCents)} · {names[c.billingPeriod]}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>Nenhum contrato encontrado.</p>}
    </div>
  );
}
