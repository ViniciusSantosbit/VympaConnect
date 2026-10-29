import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { goalMetricDefinitions, parseMoney, type GoalView } from '@vympa/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/features/auth/auth-api';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FinanceError, today, moneyText } from '@/features/finance/finance-ui';
import { goalNames } from './goal-ui';
type FormValues = {
  title: string;
  description: string;
  category: string;
  metric: string;
  mode: string;
  direction: string;
  target: string;
  baseline: string;
  startsOn: string;
  endsOn: string;
  priority: string;
  periodicity: string;
  segment: string;
  scope: string;
  assigneeIds: string[];
  adminVisible: boolean;
  allowManualUpdates: boolean;
  alertDays: number;
  notes: string;
  reason: string;
};
export function GoalEditor({
  category = 'COMMERCIAL',
  initial,
  onClose,
}: {
  category?: string;
  initial?: GoalView;
  onClose: () => void;
}) {
  const qc = useQueryClient(),
    [error, setError] = useState<unknown>(null),
    [requestKey] = useState(() => crypto.randomUUID());
  const initialMetric =
    category === 'FINANCIAL'
      ? 'RECEIVED_INCOME'
      : category === 'TEAM'
        ? 'CUSTOM_ACTIVITY'
        : 'NEW_LEADS';
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      category: initial?.category ?? category,
      metric: initial?.metric ?? initialMetric,
      mode: initial?.mode ?? (category === 'TEAM' ? 'MANUAL' : 'AUTO'),
      direction: initial?.direction ?? 'GROWTH',
      target: initial
        ? initial.unit === 'CENTS'
          ? moneyText(Number(initial.target))
          : initial.target
        : '',
      baseline: initial?.baseline
        ? initial.unit === 'CENTS'
          ? moneyText(Number(initial.baseline))
          : initial.baseline
        : '',
      startsOn: initial?.startsOn.slice(0, 10) ?? today().slice(0, 7) + '-01',
      endsOn: initial?.endsOn.slice(0, 10) ?? today(),
      priority: initial?.priority ?? 'MEDIUM',
      periodicity: initial?.periodicity ?? 'CUSTOM',
      segment: initial?.segment ?? '',
      scope: initial?.scope ?? 'COMPANY',
      assigneeIds: initial?.assignments.map((a) => a.profileId) ?? [],
      adminVisible: initial?.adminVisible ?? false,
      allowManualUpdates: initial?.allowManualUpdates ?? false,
      alertDays: initial?.alertDays ?? 7,
      notes: initial?.notes ?? '',
      reason: '',
    },
  });
  const values = useWatch({ control });
  const definition = goalMetricDefinitions.find((m) => m.code === values.metric)!;
  const users = useQuery({
    queryKey: ['assignees'],
    queryFn: () => authApi<{ id: string; email: string }[]>('/prospecting/assignees'),
  });
  function dates(period: string) {
    let start = new Date(today() + 'T00:00:00Z'),
      end = new Date(start);
    if (period === 'WEEKLY') end.setUTCDate(start.getUTCDate() + 6);
    if (period === 'MONTHLY') {
      start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 86400000);
    }
    if (period === 'QUARTERLY') {
      start = new Date(
        Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1),
      );
      end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1) - 86400000);
    }
    if (period === 'YEARLY') {
      start = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
      end = new Date(Date.UTC(start.getUTCFullYear(), 11, 31));
    }
    if (period !== 'CUSTOM') {
      setValue('startsOn', start.toISOString().slice(0, 10));
      setValue('endsOn', end.toISOString().slice(0, 10));
    }
  }
  function chooseMetric(code: string) {
    const def = goalMetricDefinitions.find((m) => m.code === code)!;
    setValue('metric', code);
    setValue('mode', ['MEETINGS', 'CUSTOM_ACTIVITY'].includes(code) ? 'MANUAL' : 'AUTO');
    setValue('direction', code.startsWith('PAID_') ? 'LIMIT' : 'GROWTH');
    setValue('allowManualUpdates', false);
    if (def.financial) setValue('scope', 'COMPANY');
  }
  async function submit(d: FormValues) {
    setError(null);
    try {
      const { reason, ...data } = d;
      const numeric = (v: string) =>
        definition.unit === 'CENTS' ? String(parseMoney(v)) : v.replace(',', '.');
      const body = {
        ...data,
        category: initial?.category ?? values.category ?? d.category,
        metric: definition.code,
        mode: initial?.mode ?? values.mode ?? d.mode,
        direction: initial?.direction ?? values.direction ?? d.direction,
        scope: definition.financial ? 'COMPANY' : d.scope,
        requestKey: initial ? undefined : requestKey,
        target: numeric(d.target),
        baseline:
          (initial?.direction ?? values.direction) === 'REDUCTION'
            ? numeric(d.baseline)
            : undefined,
        segment: d.segment || null,
        alertDays: Number(d.alertDays),
        assigneeIds: d.assigneeIds ?? [],
        ...(initial ? { version: initial.version, reason } : {}),
      };
      await authApi('/goals' + (initial ? '/' + initial.id : ''), initial ? 'PATCH' : 'POST', body);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['goals'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
      onClose();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="goal-editor">
        <DialogTitle>{initial ? 'Editar meta' : 'Criar meta'}</DialogTitle>
        <DialogDescription>
          Defina uma meta auditável. Dinheiro recebido, previsão e MRR são indicadores separados.
        </DialogDescription>
        <form onSubmit={(e) => void handleSubmit(submit)(e)}>
          <div className="goal-form-grid">
            <label>
              Nome
              <input {...register('title')} required minLength={2} maxLength={180} />
            </label>
            <label>
              Categoria
              <select
                {...register('category')}
                disabled={!!initial}
                onChange={(e) => {
                  setValue('category', e.target.value);
                  chooseMetric(
                    e.target.value === 'FINANCIAL'
                      ? 'RECEIVED_INCOME'
                      : e.target.value === 'TEAM'
                        ? 'CUSTOM_ACTIVITY'
                        : 'NEW_LEADS',
                  );
                }}
              >
                {['COMMERCIAL', 'FINANCIAL', 'TEAM'].map((v) => (
                  <option key={v} value={v}>
                    {goalNames[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Indicador
              <select
                {...register('metric')}
                disabled={!!initial}
                onChange={(e) => chooseMetric(e.target.value)}
              >
                {goalMetricDefinitions
                  .filter((m) => (values.category === 'FINANCIAL') === m.financial)
                  .map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tipo
              <input value={goalNames[values.mode ?? 'AUTO']} readOnly />
            </label>
            <label>
              Valor-alvo{' '}
              {definition.unit === 'CENTS'
                ? '(R$)'
                : definition.unit === 'PERCENT'
                  ? '(%)'
                  : definition.unit === 'COUNT'
                    ? '(quantidade)'
                    : '(unidades)'}
              <input {...register('target')} required inputMode="decimal" placeholder="0" />
            </label>
            <label>
              Regra de progresso
              <select
                {...register('direction')}
                disabled={!!initial || !values.metric?.startsWith('PAID_')}
              >
                {(values.metric?.startsWith('PAID_') ? ['LIMIT', 'REDUCTION'] : ['GROWTH']).map(
                  (v) => (
                    <option key={v} value={v}>
                      {goalNames[v]}
                    </option>
                  ),
                )}
              </select>
            </label>
            {values.direction === 'REDUCTION' && (
              <label>
                Base de custos para comparação (R$)
                <input {...register('baseline')} required inputMode="decimal" />
              </label>
            )}
            <label>
              Periodicidade
              <select
                {...register('periodicity')}
                onChange={(e) => {
                  setValue('periodicity', e.target.value);
                  dates(e.target.value);
                }}
              >
                {['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'].map((v) => (
                  <option key={v} value={v}>
                    {goalNames[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prioridade
              <select {...register('priority')}>
                {['LOW', 'MEDIUM', 'HIGH'].map((v) => (
                  <option key={v} value={v}>
                    {goalNames[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data inicial
              <input type="date" {...register('startsOn')} required />
            </label>
            <label>
              Data final
              <input type="date" {...register('endsOn')} required />
            </label>
            <label>
              Escopo do cálculo
              <select {...register('scope')} disabled={definition.financial}>
                <option value="COMPANY">Toda a empresa</option>
                <option value="ASSIGNED">Atividades dos responsáveis</option>
              </select>
            </label>
            <label>
              Segmento
              <select {...register('segment')} disabled={values.mode === 'MANUAL'}>
                <option value="">Todos os segmentos</option>
                <option value="ADVOCACIA">Advocacia</option>
                <option value="CONTABILIDADE">Contabilidade</option>
                <option value="IMOBILIARIO">Imobiliário</option>
              </select>
            </label>
            <label>
              Antecedência do alerta (dias)
              <input
                type="number"
                {...register('alertDays', { valueAsNumber: true })}
                min={0}
                max={90}
                required
              />
            </label>
            <label>
              Descrição
              <textarea {...register('description')} maxLength={3000} />
            </label>
            <label>
              Observações
              <textarea {...register('notes')} maxLength={3000} />
            </label>
          </div>
          <fieldset className="goal-assignments">
            <legend>Responsáveis pelo acompanhamento</legend>
            {users.isError && <FinanceError error={users.error} />}
            {users.data?.map((u) => (
              <label key={u.id}>
                <input type="checkbox" value={u.id} {...register('assigneeIds')} />
                {u.email}
              </label>
            ))}
            {!users.data?.length && <p>Nenhum administrador ativo disponível.</p>}
          </fieldset>
          {!definition.financial && (
            <label className="goal-check">
              <input type="checkbox" {...register('adminVisible')} /> Permitir consulta por ADMIN em
              metas empresariais
            </label>
          )}
          {values.mode === 'MANUAL' && (
            <label className="goal-check">
              <input type="checkbox" {...register('allowManualUpdates')} /> Permitir atualizações
              por ADMIN autorizado
            </label>
          )}
          <p className="goal-source">
            Fonte: {definition.source}
            {definition.financial
              ? ' Responsáveis acompanham o objetivo empresarial; dinheiro não é atribuído a um sócio.'
              : ''}
          </p>
          {initial && (
            <label>
              Justificativa da alteração
              <textarea {...register('reason')} minLength={5} required />
            </label>
          )}
          {error != null && <FinanceError error={error} />}
          <div className="finance-actions">
            <Button type="submit" disabled={isSubmitting}>
              Salvar meta
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Voltar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
