import { BadRequestException, Injectable } from '@nestjs/common';
import { goalMetricDefinitions } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { today, validDate } from '../clients/commercial-support.js';
export type MetricContext = {
  startsOn: string;
  endsOn: string;
  asOf?: string;
  segment?: string | null;
  responsibleIds?: string[];
};
export type MetricResult = {
  value: string | null;
  reason: string | null;
  source: string;
  cutoff: string;
  updatedAt: string;
};
export const metricDefinition = (code: string) => {
  const m = goalMetricDefinitions.find((m) => m.code === code);
  if (!m) throw new BadRequestException('Indicador inválido.');
  return m;
};
export function metricWindow(c: MetricContext) {
  const start = validDate(c.startsOn),
    last = validDate(c.endsOn),
    asOf = validDate(c.asOf ?? today());
  if (
    last < start ||
    last.getTime() - start.getTime() > 1830 * 86400000 ||
    asOf > validDate(today())
  )
    throw new BadRequestException(
      'Período inválido (máximo de cinco anos; corte não pode ser futuro).',
    );
  const cutoff = last < asOf ? c.endsOn : (c.asOf ?? today());
  const end = new Date(validDate(cutoff).getTime() + 86400000);
  // Historical business events use local calendar days (São Paulo UTC-03).
  const eventsStart = new Date(start.getTime() + 3 * 3600000),
    eventsEnd = new Date(Math.min(end.getTime() + 3 * 3600000, Date.now()));
  return { start, end, eventsStart, eventsEnd, cutoff, beforeStart: asOf < start };
}
@Injectable()
export class GoalMetricsService {
  constructor(private readonly db: DatabaseService) {}
  async calculate(
    code: string,
    c: MetricContext,
    cache?: Map<string, Promise<MetricResult>>,
  ): Promise<MetricResult> {
    const key = JSON.stringify([code, c]);
    if (cache?.has(key)) return cache.get(key)!;
    const promise = this.read(code, c);
    cache?.set(key, promise);
    return promise;
  }
  private async read(code: string, c: MetricContext): Promise<MetricResult> {
    const def = metricDefinition(code),
      w = metricWindow(c);
    const result = (value: string | null, reason: string | null = null): MetricResult => ({
      value,
      reason,
      source:
        def.source +
        (c.segment
          ? ' Segmento cadastral atual; registros sem vínculo empresarial não entram no recorte.'
          : ''),
      cutoff: w.cutoff,
      updatedAt: new Date().toISOString(),
    });
    if (w.beforeStart) return result(null, 'O período da meta ainda não começou.');
    if (['MEETINGS', 'CUSTOM_ACTIVITY', 'RECEIVED_SERVICE'].includes(code))
      return result(null, def.source);
    if (['EXPECTED_INCOME', 'PLANNED_INVESTMENTS'].includes(code) && c.asOf && c.asOf < today())
      return result(
        null,
        'Previsões atuais não reconstruem pendências históricas com segurança; consulte o período atual.',
      );
    if (def.financial && c.responsibleIds?.length)
      return result(
        null,
        'O Financeiro não tem atribuição de resultado por usuário. Use escopo empresarial; responsáveis acompanham a meta sem ratear o caixa.',
      );
    const ids = c.responsibleIds ?? [];
    const actor = (field: Prisma.Sql) =>
      ids.length
        ? Prisma.sql`AND ${field} IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`
        : Prisma.empty;
    const segment = (field: Prisma.Sql) =>
      c.segment ? Prisma.sql`AND ${field}=${c.segment}::vympa_private."LeadSegment"` : Prisma.empty;
    const scalar = async (sql: Prisma.Sql) => {
      const rows = await this.db.$queryRaw<{ value: string }[]>(sql);
      return rows[0]?.value ?? '0';
    };
    if (code === 'NEW_LEADS')
      return result(
        await scalar(
          Prisma.sql`SELECT COUNT(*)::text AS value FROM vympa_private.leads l WHERE l.created_at>=${w.eventsStart} AND l.created_at<${w.eventsEnd} ${actor(Prisma.sql`l.created_by_id`)} ${segment(Prisma.sql`l.segment`)}`,
        ),
      );
    if (
      [
        'CONTACTED_LEADS',
        'WON_NEGOTIATIONS',
        'NEGOTIATIONS_STARTED',
        'COMPLETED_ACTIVITIES',
      ].includes(code)
    ) {
      const condition =
        code === 'CONTACTED_LEADS'
          ? Prisma.sql`e.kind='INTERACTION'`
          : code === 'WON_NEGOTIATIONS'
            ? Prisma.sql`e.kind='STATUS' AND e.new_status='WON'`
            : code === 'NEGOTIATIONS_STARTED'
              ? Prisma.sql`e.kind='STATUS' AND e.new_status='NEGOTIATING'`
              : Prisma.sql`e.kind='FOLLOW_UP_DONE'`;
      const count =
        code === 'COMPLETED_ACTIVITIES'
          ? Prisma.sql`COUNT(e.id)`
          : Prisma.sql`COUNT(DISTINCT e.lead_id)`;
      return result(
        await scalar(
          Prisma.sql`SELECT ${count}::text AS value FROM vympa_private.lead_events e JOIN vympa_private.leads l ON l.id=e.lead_id WHERE ${condition} AND e.created_at>=${w.eventsStart} AND e.created_at<${w.eventsEnd} ${actor(Prisma.sql`e.actor_id`)} ${segment(Prisma.sql`l.segment`)}`,
        ),
      );
    }
    if (code === 'CONVERSION_RATE') {
      const rows = await this.db.$queryRaw<{ total: string; converted: string }[]>(
        Prisma.sql`SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM vympa_private.lead_events e WHERE e.lead_id=l.id AND e.kind='CLIENT_LINKED' AND e.created_at<${w.eventsEnd}))::text AS converted FROM vympa_private.leads l WHERE l.created_at>=${w.eventsStart} AND l.created_at<${w.eventsEnd} ${actor(Prisma.sql`l.created_by_id`)} ${segment(Prisma.sql`l.segment`)}`,
      );
      const r = rows[0]!;
      return r.total === '0'
        ? result(null, 'Não há leads na coorte; divisão por zero evitada.')
        : result(new Prisma.Decimal(r.converted).mul(100).div(r.total).toFixed(4));
    }
    if (code === 'SENT_PROPOSALS')
      return result(
        await scalar(
          Prisma.sql`SELECT COUNT(DISTINCT v."proposalId")::text AS value FROM vympa_private.proposal_versions v WHERE v.snapshot->>'status'='SENT' AND v."createdAt">=${w.eventsStart} AND v."createdAt"<${w.eventsEnd} ${actor(Prisma.sql`(v.snapshot->>'responsibleId')::uuid`)} ${c.segment ? Prisma.sql`AND v.snapshot->>'segment'=${c.segment}` : Prisma.empty}`,
        ),
      );
    if (code === 'NEW_CLIENTS')
      return result(
        await scalar(
          Prisma.sql`SELECT COUNT(*)::text AS value FROM vympa_private.clients c LEFT JOIN LATERAL (SELECT a."actorId" FROM vympa_private.client_activities a WHERE a."clientId"=c.id AND a.kind IN ('CLIENT_CREATED','LEAD_CONVERTED') ORDER BY a."createdAt",a.id LIMIT 1) first_event ON true WHERE c."createdAt">=${w.eventsStart} AND c."createdAt"<${w.eventsEnd} ${actor(Prisma.sql`first_event."actorId"`)} ${segment(Prisma.sql`c.segment`)}`,
        ),
      );
    if (code === 'SIGNED_CONTRACTS' || code === 'ACTIVATED_CONTRACTS')
      return result(
        await scalar(
          Prisma.sql`SELECT COUNT(DISTINCT h."contractId")::text AS value FROM vympa_private.contract_history h JOIN vympa_private.contracts k ON k.id=h."contractId" JOIN vympa_private.clients c ON c.id=k."clientId" WHERE h.kind='CONTRACT_STATUS_CHANGED' AND h.after->>'status'=${code === 'SIGNED_CONTRACTS' ? 'SIGNED' : 'ACTIVE'} AND h."createdAt">=${w.eventsStart} AND h."createdAt"<${w.eventsEnd} ${actor(Prisma.sql`h."actorId"`)} ${segment(Prisma.sql`c.segment`)}`,
        ),
      );
    if (code === 'CONTRACTED_MRR') return this.mrr(c, w, result);
    if (code === 'MONTHLY_GROWTH') {
      const first = validDate(c.startsOn),
        last = validDate(c.endsOn),
        next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
      if (
        first.getUTCDate() !== 1 ||
        last.getTime() !== next.getTime() - 86400000 ||
        c.endsOn >= today()
      )
        return result(
          null,
          'Compare um mês civil completo e já encerrado; o mês corrente ainda está em formação.',
        );
      const prev = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1))
          .toISOString()
          .slice(0, 10),
        prevEnd = new Date(first.getTime() - 86400000).toISOString().slice(0, 10);
      const current = await this.calculate('RECEIVED_INCOME', c),
        previous = await this.calculate('RECEIVED_INCOME', {
          ...c,
          startsOn: prev,
          endsOn: prevEnd,
        });
      return previous.value === '0' || previous.value === null
        ? result(null, 'A receita do mês anterior é zero ou indisponível.')
        : result(
            new Prisma.Decimal(current.value!)
              .minus(previous.value)
              .mul(100)
              .div(previous.value)
              .toFixed(4),
          );
    }
    if (code === 'PLANNED_INVESTMENTS') {
      if (c.segment)
        return result(null, 'Investimentos não possuem atribuição estruturada por segmento.');
      return result(
        await scalar(
          Prisma.sql`SELECT COALESCE(SUM("estimatedCents"),0)::text AS value FROM vympa_private.investments WHERE status IN ('PLANNED','APPROVED') AND "plannedOn">=${w.start} AND "plannedOn"<${new Date(validDate(c.endsOn).getTime() + 86400000)} AND "createdAt"<${w.eventsEnd}`,
        ),
      );
    }
    const expected = code === 'EXPECTED_INCOME';
    const kind = [
      'PAID_EXPENSES',
      'PAID_AI_COSTS',
      'PAID_INFRA_COSTS',
      'EXECUTED_INVESTMENTS',
    ].includes(code)
      ? 'EXPENSE'
      : 'INCOME';
    const value =
      code === 'CASH_RESULT'
        ? Prisma.sql`SUM(CASE WHEN f.type='INCOME' THEN f."amountCents" ELSE -f."amountCents" END)`
        : Prisma.sql`SUM(f."amountCents")`;
    const type =
      code === 'CASH_RESULT'
        ? Prisma.empty
        : Prisma.sql`AND f.type=${kind}::vympa_private."FinancialType"`;
    const plannedEnd = new Date(validDate(c.endsOn).getTime() + 86400000);
    const dates = expected
      ? Prisma.sql`f.status IN ('PLANNED','PENDING') AND COALESCE(f."dueOn",f."competenceOn")>=${w.start} AND COALESCE(f."dueOn",f."competenceOn")<${plannedEnd} AND f."createdAt"<${w.eventsEnd}`
      : Prisma.sql`f.status='SETTLED' AND f."settledOn">=${w.start} AND f."settledOn"<${w.end}`;
    return result(
      await scalar(
        Prisma.sql`SELECT COALESCE(${value},0)::text AS value FROM vympa_private.financial_transactions f LEFT JOIN vympa_private.clients c ON c.id=f."clientId" WHERE ${dates} ${type} ${segment(Prisma.sql`c.segment`)} ${code === 'PAID_AI_COSTS' ? Prisma.sql`AND f."categoryGroup"='AI'` : code === 'PAID_INFRA_COSTS' ? Prisma.sql`AND f."categoryGroup"='INFRA'` : Prisma.empty} ${code === 'EXECUTED_INVESTMENTS' ? Prisma.sql`AND EXISTS (SELECT 1 FROM vympa_private.investments i WHERE i."transactionId"=f.id)` : Prisma.empty}`,
      ),
    );
  }
  private async mrr(
    c: MetricContext,
    w: ReturnType<typeof metricWindow>,
    result: (v: string | null, r?: string | null) => MetricResult,
  ) {
    if (c.responsibleIds?.length)
      return result(null, 'MRR não é atribuído automaticamente a um sócio.');
    const rows = await this.db.contract.findMany({
      where: {
        createdAt: { lt: w.eventsEnd },
        ...(c.segment
          ? { client: { segment: c.segment as 'ADVOCACIA' | 'CONTABILIDADE' | 'IMOBILIARIO' } }
          : {}),
      },
      select: {
        id: true,
        history: {
          where: { createdAt: { lt: w.eventsEnd } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { after: true },
        },
        amendments: {
          where: { createdAt: { lt: w.eventsEnd }, effectiveOn: { lt: w.end } },
          orderBy: { effectiveOn: 'desc' },
          select: { monthlyCents: true },
        },
      },
    });
    let sum = 0n;
    for (const row of rows) {
      const snapshot = row.history
        .map(
          (h) =>
            h.after as {
              status?: string;
              startsOn?: string;
              endsOn?: string;
              monthlyCents?: number | null;
              billingPeriod?: string;
            },
        )
        .find((h) => h && h.status);
      if (!snapshot)
        return result(
          null,
          'Há contratos sem histórico suficiente para reconstruir o MRR nesta data.',
        );
      if (
        snapshot.status !== 'ACTIVE' ||
        snapshot.billingPeriod === 'ONCE' ||
        !snapshot.startsOn ||
        snapshot.startsOn.slice(0, 10) > w.cutoff ||
        (snapshot.endsOn && snapshot.endsOn.slice(0, 10) < w.cutoff)
      )
        continue;
      const value = row.amendments[0]?.monthlyCents ?? snapshot.monthlyCents;
      if (value == null) return result(null, 'Há contratos ativos com mensalidade indefinida.');
      sum += BigInt(value);
    }
    return result(sum.toString());
  }
}
