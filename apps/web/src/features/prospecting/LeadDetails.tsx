import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadStatuses, statusLabels } from '@vympa/shared';
import type { LeadRecord, LeadStatus } from '@vympa/shared';
import { authApi } from '@/features/auth/auth-api';
import { prospectMessage as authMessage } from './prospecting-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export function LeadDetails({
  id,
  onClose,
  assignees,
}: {
  id: string;
  onClose: () => void;
  assignees: { id: string; email: string }[];
}) {
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['lead', id],
    queryFn: () => authApi<LeadRecord>('/prospecting/leads/' + id),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      suffix = '',
      body,
      method = 'POST',
    }: {
      suffix?: string;
      body?: unknown;
      method?: string;
    }) => authApi('/prospecting/leads/' + id + suffix, method, body),
    onSuccess: async () => {
      setNotice('Alteração salva.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['lead', id] }),
        client.invalidateQueries({ queryKey: ['leads'] }),
        client.invalidateQueries({ queryKey: ['place-references'] }),
        client.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });
  const lead = query.data;
  function status(value: LeadStatus) {
    const lossReason =
      value === 'LOST' ? window.prompt('Motivo da perda (obrigatório):') : undefined;
    if (value === 'LOST' && !lossReason?.trim()) return;
    mutation.mutate({ suffix: '/status', method: 'PATCH', body: { status: value, lossReason } });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="lead-dialog">
        <DialogTitle>{lead?.companyName ?? 'Detalhes do lead'}</DialogTitle>
        <DialogDescription>
          Dados comerciais próprios da VYMPA. WON representa uma negociação ganha, não um contrato
          assinado.
        </DialogDescription>
        {query.isPending ? (
          <p role="status">Carregando lead…</p>
        ) : query.isError ? (
          <p role="alert">{authMessage(query.error)}</p>
        ) : (
          lead && (
            <>
              {lead.externalReference && (
                <p className="place-reference">
                  Referência{' '}
                  {lead.externalReference.placeId.startsWith('geoapify_')
                    ? 'Geoapify'
                    : 'Google (legado)'}
                  : {lead.externalReference.placeId}
                  <br />
                  Os dados do estabelecimento devem ser consultados sob demanda na Prospecção.
                </p>
              )}
              <div className="lead-fields">
                <label>
                  Status
                  <select
                    value={lead.status}
                    disabled={mutation.isPending}
                    onChange={(e) => status(e.target.value as LeadStatus)}
                  >
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
                    value={lead.assigneeId ?? ''}
                    disabled={mutation.isPending}
                    onChange={(e) =>
                      mutation.mutate({
                        method: 'PATCH',
                        body: { assigneeId: e.target.value || null },
                      })
                    }
                  >
                    <option value="">Sem responsável</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {lead.lossReason && <p>Motivo da perda: {lead.lossReason}</p>}
              <form
                key={lead.updatedAt}
                className="lead-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const body = Object.fromEntries(
                    [...data.entries()].map(([key, value]) => [key, value === '' ? null : value]),
                  );
                  mutation.mutate({ method: 'PATCH', body });
                }}
              >
                <label>
                  Nome próprio / fornecido pela empresa
                  <Input
                    name="companyName"
                    defaultValue={lead.companyName ?? ''}
                    minLength={2}
                    maxLength={180}
                  />
                </label>
                <label>
                  E-mail obtido legitimamente
                  <Input name="email" type="email" defaultValue={lead.email ?? ''} />
                </label>
                <label>
                  Contato responsável
                  <Input name="contactName" defaultValue={lead.contactName ?? ''} maxLength={150} />
                </label>
                <label>
                  Canal de contato próprio
                  <Input
                    name="contactChannel"
                    defaultValue={lead.contactChannel ?? ''}
                    maxLength={180}
                  />
                </label>
                <label>
                  Próxima ação
                  <Input name="nextAction" defaultValue={lead.nextAction ?? ''} maxLength={500} />
                </label>
                <Button type="submit" disabled={mutation.isPending}>
                  Salvar dados próprios
                </Button>
              </form>
              <p className="prospect-note">
                Insira somente informações necessárias para o relacionamento B2B, obtidas
                legitimamente. Não copie dados do Google para estes campos.
              </p>
              <div className="lead-fields">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    mutation.mutate({ suffix: '/notes', body: { body: f.get('body') } });
                    e.currentTarget.reset();
                  }}
                >
                  <h3>Observação comercial</h3>
                  <textarea name="body" required maxLength={4000} aria-label="Nova observação" />
                  <Button type="submit" disabled={mutation.isPending}>
                    Registrar nota
                  </Button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    mutation.mutate({
                      suffix: '/interactions',
                      body: { body: f.get('body'), channel: f.get('channel') },
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <h3>Registrar interação</h3>
                  <select name="channel" aria-label="Canal da interação">
                    <option value="PHONE">Telefone</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="MEETING">Reunião</option>
                    <option value="OTHER">Outro</option>
                  </select>
                  <textarea
                    name="body"
                    required
                    maxLength={4000}
                    aria-label="Descrição da interação"
                  />
                  <Button type="submit" disabled={mutation.isPending}>
                    Registrar contato
                  </Button>
                </form>
              </div>
              <form
                className="lead-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  mutation.mutate({
                    suffix: '/follow-ups',
                    body: {
                      action: f.get('action'),
                      dueAt: new Date(String(f.get('dueAt'))).toISOString(),
                    },
                  });
                }}
              >
                <label>
                  Acompanhamento
                  <Input name="action" required maxLength={500} />
                </label>
                <label>
                  Data e horário
                  <Input name="dueAt" type="datetime-local" required />
                </label>
                <Button type="submit" disabled={mutation.isPending}>
                  Agendar ação
                </Button>
              </form>
              <h3>Acompanhamentos</h3>
              {lead.followUps?.length ? (
                lead.followUps.map((f) => (
                  <div className="follow-row" key={f.id}>
                    <span>
                      {f.action}
                      <small>
                        {new Date(f.dueAt).toLocaleString('pt-BR')}
                        {!f.completedAt && new Date(f.dueAt) < new Date() ? ' · Atrasado' : ''}
                      </small>
                    </span>
                    {f.completedAt ? (
                      <span>Concluído</span>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({
                            suffix: `/follow-ups/${f.id}/complete`,
                            method: 'PATCH',
                          })
                        }
                      >
                        Concluir
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <p>Nenhum acompanhamento agendado.</p>
              )}
              <p>
                Último contato:{' '}
                {lead.lastContactAt
                  ? new Date(lead.lastContactAt).toLocaleString('pt-BR')
                  : 'Ainda não registrado'}
              </p>
              <h3>Histórico de interações e alterações</h3>
              <ol className="lead-history">
                {lead.events?.map((event) => (
                  <li key={event.id}>
                    <strong>
                      {event.kind === 'STATUS'
                        ? `${statusLabels[event.previousStatus!]} → ${statusLabels[event.newStatus!]}`
                        : (event.channel ?? event.kind)}
                    </strong>
                    <p>{event.body}</p>
                    <small>
                      {event.actor.email} · {new Date(event.createdAt).toLocaleString('pt-BR')}
                    </small>
                  </li>
                ))}
              </ol>
              <p className="prospect-note">
                Exibindo os últimos 100 eventos e até 100 acompanhamentos.
              </p>
            </>
          )
        )}
        {notice && <p role="status">{notice}</p>}
        {mutation.isError && <p role="alert">{authMessage(mutation.error)}</p>}
      </DialogContent>
    </Dialog>
  );
}
