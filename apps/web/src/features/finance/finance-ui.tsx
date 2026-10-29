import { useState, type ReactNode, type FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { brl, parseMoney } from '@vympa/shared';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authMessage } from '@/features/auth/auth-api';
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const currentMonth = () => today().slice(0, 7);
export const moneyText = (v: unknown) =>
  typeof v === 'number'
    ? (v < 0 ? '-' : '') +
      String(Math.trunc(Math.abs(v) / 100)) +
      ',' +
      String(Math.abs(v % 100)).padStart(2, '0')
    : '';
export const dateText = (s: string | null | undefined) =>
  s ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(s)) : '—';
export function financeMessage(error: unknown) {
  if (axios.isAxiosError(error) && [400, 409].includes(error.response?.status ?? 0)) {
    const m = error.response?.data?.message;
    if (Array.isArray(m)) return m.join(' · ');
    if (typeof m === 'string') return m;
  }
  return authMessage(error);
}
export const statusNames: Record<string, string> = {
  DRAFT: 'Rascunho',
  PREPARED: 'Preparada',
  SENT: 'Enviada',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  EXPIRED: 'Expirada',
  PLANNED: 'Prevista',
  PENDING: 'Pendente',
  SETTLED: 'Realizada',
  CANCELLED: 'Cancelada',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  GENERAL: 'Geral',
  AI: 'Inteligência artificial',
  INFRA: 'Infraestrutura',
  INVESTMENT: 'Investimento',
};
export function FinanceBack() {
  return (
    <nav className="finance-back" aria-label="Navegação financeira">
      <Link to="/finance">Financeiro</Link>
      <span>/</span>
      <Link to="/finance/simulator">Simulador</Link>
      <span>/</span>
      <Link to="/finance/management">Gestão financeira</Link>
    </nav>
  );
}
export function FinancialMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null | undefined;
  note?: string;
}) {
  return (
    <article className="finance-metric">
      <span>{label}</span>
      <strong
        className={
          value != null && value < 0 ? 'negative' : value != null && value > 0 ? 'positive' : ''
        }
      >
        {brl(value)}
      </strong>
      {note && <small>{note}</small>}
    </article>
  );
}
export function FinanceError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="finance-error">
      {financeMessage(error)}
    </p>
  );
}
export interface Field {
  name: string;
  label: string;
  kind?: 'money' | 'number' | 'date' | 'month' | 'textarea' | 'checkbox' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  min?: number;
  max?: number;
  signed?: boolean;
}
export function FinanceForm({
  title,
  description,
  fields,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  description: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      fields.map((f) => {
        const v = initial?.[f.name];
        return [
          f.name,
          f.kind === 'money'
            ? moneyText(v)
            : f.kind === 'checkbox'
              ? !!v
              : v == null
                ? ''
                : String(v).slice(0, f.kind === 'date' ? 10 : 10000),
        ];
      }),
    ),
  );
  const hasStatus = fields.some((f) => f.name === 'status');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.name];
        if (f.name === 'settledOn' && hasStatus && values.status !== 'SETTLED') {
          data[f.name] = null;
          continue;
        }
        data[f.name] =
          f.kind === 'money'
            ? f.signed && String(v).startsWith('-')
              ? -(parseMoney(String(v).slice(1)) ?? 0)
              : parseMoney(String(v))
            : f.kind === 'number'
              ? v === ''
                ? undefined
                : Number(v)
              : f.kind === 'checkbox'
                ? !!v
                : v === ''
                  ? f.kind === 'date' || f.name === 'transactionId' || f.name === 'quantity'
                    ? null
                    : ''
                  : v;
      }
      await onSave(data);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && !axios.isAxiosError(err)
          ? Object.assign(err, {
              isAxiosError: true,
              response: { status: 400, data: { message: err.message } },
            })
          : err,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="finance-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form onSubmit={submit} className="finance-form">
          <div className="finance-form-grid">
            {fields
              .filter((f) => f.name !== 'settledOn' || !hasStatus || values.status === 'SETTLED')
              .map((f) => (
                <label key={f.name} className={f.kind === 'textarea' ? 'full-width' : ''}>
                  {f.label}
                  {f.kind === 'select' ? (
                    <select
                      name={f.name}
                      aria-label={f.label}
                      value={String(values[f.name] ?? '')}
                      required={f.required}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'checkbox' ? (
                    <input
                      name={f.name}
                      type="checkbox"
                      checked={!!values[f.name]}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })}
                    />
                  ) : f.kind === 'textarea' ? (
                    <textarea
                      name={f.name}
                      maxLength={3000}
                      value={String(values[f.name] ?? '')}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  ) : (
                    <Input
                      name={f.name}
                      type={['date', 'month', 'number'].includes(f.kind ?? '') ? f.kind : 'text'}
                      inputMode={f.kind === 'money' ? 'decimal' : undefined}
                      required={f.required || f.name === 'settledOn'}
                      min={f.min}
                      max={f.max}
                      maxLength={250}
                      value={String(values[f.name] ?? '')}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  )}
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ))}
          </div>
          {error !== null && <FinanceError error={error} />}
          <div className="finance-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Voltar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function FinancePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="finance-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
