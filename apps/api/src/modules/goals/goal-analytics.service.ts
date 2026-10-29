import { BadRequestException, Injectable } from '@nestjs/common';
import { goalMetricDefinitions } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { today, validDate } from '../clients/commercial-support.js';
import { GoalMetricsService, metricWindow, type MetricResult } from './goal-metrics.service.js';
import { GoalsService } from './goals.service.js';
import type { GoalFiltersDto } from './goals.dto.js';
@Injectable()
export class GoalAnalyticsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly metrics: GoalMetricsService,
    private readonly goals: GoalsService,
  ) {}
  async analytics(q: GoalFiltersDto) {
    const startsOn = q.startsOn ?? today().slice(0, 7) + '-01',
      endsOn = q.endsOn ?? today();
    if (validDate(endsOn).getTime() - validDate(startsOn).getTime() > 366 * 86400000)
      throw new BadRequestException('A análise permite até 366 dias por consulta.');
    const context = {
        startsOn,
        endsOn,
        segment: q.segment,
        responsibleIds: q.responsibleId ? [q.responsibleId] : [],
      },
      w = metricWindow(context),
      cache = new Map<string, Promise<MetricResult>>();
    const codes = q.metric
      ? [q.metric]
      : goalMetricDefinitions
          .filter((m) => !['CUSTOM_ACTIVITY', 'MEETINGS'].includes(m.code))
          .map((m) => m.code);
    const indicators = await Promise.all(
      codes.map(async (code) => ({
        code,
        ...(await this.metrics.calculate(code, context, cache)),
      })),
    );
    const periods = [];
    for (
      let d = new Date(Date.UTC(w.start.getUTCFullYear(), w.start.getUTCMonth(), 1));
      d <= validDate(endsOn);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      const first = d.toISOString().slice(0, 10),
        last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 86400000)
          .toISOString()
          .slice(0, 10);
      periods.push({
        period: first.slice(0, 7),
        startsOn: first < startsOn ? startsOn : first,
        endsOn: last > endsOn ? endsOn : last,
      });
    }
    const seriesCodes = q.metric
      ? [q.metric]
      : ['NEW_LEADS', 'CONTACTED_LEADS', 'SENT_PROPOSALS', 'RECEIVED_INCOME', 'PAID_EXPENSES'];
    const series = await Promise.all(
      periods.map(async (p) => ({
        period: p.period,
        partial: p.endsOn === today(),
        values: await Promise.all(
          seriesCodes.map(async (code) => ({
            code,
            ...(await this.metrics.calculate(
              code,
              { ...context, startsOn: p.startsOn, endsOn: p.endsOn },
              cache,
            )),
          })),
        ),
      })),
    );
    const days =
      Math.round((validDate(endsOn).getTime() - validDate(startsOn).getTime()) / 86400000) + 1;
    const previousEnd = new Date(validDate(startsOn).getTime() - 86400000)
        .toISOString()
        .slice(0, 10),
      previousStart = new Date(validDate(startsOn).getTime() - days * 86400000)
        .toISOString()
        .slice(0, 10);
    const comparison = await Promise.all(
      seriesCodes.map(async (code) => {
        const [current, previous] = await Promise.all([
          this.metrics.calculate(code, context, cache),
          this.metrics.calculate(
            code,
            { ...context, startsOn: previousStart, endsOn: previousEnd },
            cache,
          ),
        ]);
        return {
          code,
          current: current.value,
          previous: previous.value,
          change:
            current.value === null || previous.value === null
              ? null
              : new Prisma.Decimal(current.value).minus(previous.value).toString(),
        };
      }),
    );
    const leadWhere = {
      ...(q.segment ? { segment: q.segment } : {}),
      ...(q.responsibleId ? { assigneeId: q.responsibleId } : {}),
    };
    const [stages, segments, contractGroups, expiring, renewals] = await Promise.all([
      this.db.lead.groupBy({ by: ['status'], where: leadWhere, _count: { _all: true } }),
      this.db.lead.groupBy({ by: ['segment'], where: leadWhere, _count: { _all: true } }),
      this.db.$queryRaw<{ status: string; count: string }[]>(
        Prisma.sql`SELECT CASE WHEN k.status='ACTIVE' AND k."endsOn"<${validDate(today())} THEN 'EXPIRED' ELSE k.status::text END AS status,COUNT(*)::text AS count FROM vympa_private.contracts k JOIN vympa_private.clients c ON c.id=k."clientId" WHERE true ${q.segment ? Prisma.sql`AND c.segment=${q.segment}::vympa_private."LeadSegment"` : Prisma.empty} ${q.responsibleId ? Prisma.sql`AND k."responsibleId"=${q.responsibleId}::uuid` : Prisma.empty} GROUP BY 1`,
      ),
      this.db.contract.count({
        where: {
          status: { in: ['ACTIVE', 'SIGNED'] },
          endsOn: {
            gte: validDate(today()),
            lte: new Date(validDate(today()).getTime() + 30 * 86400000),
          },
          ...(q.segment ? { client: { segment: q.segment } } : {}),
          ...(q.responsibleId ? { responsibleId: q.responsibleId } : {}),
        },
      }),
      this.db.contract.count({
        where: {
          status: 'DRAFT',
          renewedFromId: { not: null },
          ...(q.segment ? { client: { segment: q.segment } } : {}),
          ...(q.responsibleId ? { responsibleId: q.responsibleId } : {}),
        },
      }),
    ]);
    const time = await this.db.$queryRaw<{ hours: string | null; samples: string }[]>(
      Prisma.sql`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_contact.at-l.created_at))/3600)::numeric,2)::text AS hours,COUNT(*)::text AS samples FROM vympa_private.leads l JOIN LATERAL (SELECT MIN(e.created_at) AS at FROM vympa_private.lead_events e WHERE e.lead_id=l.id AND e.kind='INTERACTION' AND e.created_at<${w.eventsEnd}) first_contact ON first_contact.at IS NOT NULL WHERE l.created_at>=${w.eventsStart} AND l.created_at<${w.eventsEnd} ${q.segment ? Prisma.sql`AND l.segment=${q.segment}::vympa_private."LeadSegment"` : Prisma.empty} ${q.responsibleId ? Prisma.sql`AND l.created_by_id=${q.responsibleId}::uuid` : Prisma.empty}`,
    );
    const revenueBySegment = await Promise.all(
      ['ADVOCACIA', 'CONTABILIDADE', 'IMOBILIARIO'].map(async (segment) => ({
        segment,
        ...(await this.metrics.calculate('RECEIVED_INCOME', { ...context, segment }, cache)),
      })),
    );
    return {
      generatedAt: new Date().toISOString(),
      startsOn,
      endsOn,
      indicators,
      comparison,
      comparisonSource: `Período anterior de igual duração: ${previousStart} a ${previousEnd}.`,
      series,
      stages: stages.map((g) => ({ status: g.status, count: g._count._all })),
      segments: segments.map((g) => ({ segment: g.segment, count: g._count._all })),
      portfolioSource:
        'Carteira atual, independentemente do período do gráfico. Segmento e responsável cadastrais atuais; não reconstrói estágios passados.',
      contracts: contractGroups.map((g) => ({ status: g.status, count: Number(g.count) })),
      expiring,
      renewals,
      timeToFirstContact: {
        hours: time[0]?.hours ?? null,
        samples: time[0]?.samples ?? '0',
        source: 'Média de horas entre cadastro e primeira interação estruturada da coorte.',
      },
      revenueBySegment,
      financialNote:
        'Receita recebida e despesas são caixa conciliado. Previsto e MRR ficam separados. Não há atribuição automática de dinheiro a sócios nem rateio de receitas por serviço.',
    };
  }
  async team(q: GoalFiltersDto, actor: string, role: string) {
    const profiles = await this.db.adminProfile.findMany({
      where: {
        active: true,
        ...(role === 'OWNER' ? (q.responsibleId ? { id: q.responsibleId } : {}) : { id: actor }),
      },
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
    const cache = new Map<string, Promise<MetricResult>>();
    const startsOn = q.startsOn ?? today().slice(0, 7) + '-01',
      endsOn = q.endsOn ?? today();
    metricWindow({ startsOn, endsOn });
    const people = await Promise.all(
      profiles.map(async (p) => ({
        profile: p,
        leadsAssigned: await this.db.lead.count({
          where: { assigneeId: p.id, ...(q.segment ? { segment: q.segment } : {}) },
        }),
        goals: await this.goals.list({ ...q, page: 1, responsibleId: p.id }, actor, role),
        indicators: await Promise.all(
          [
            'CONTACTED_LEADS',
            'NEGOTIATIONS_STARTED',
            'WON_NEGOTIATIONS',
            'SENT_PROPOSALS',
            'COMPLETED_ACTIVITIES',
          ]
            .filter((code) => !q.metric || q.metric === code)
            .map(async (code) => ({
              code,
              ...(await this.metrics.calculate(
                code,
                { startsOn, endsOn, segment: q.segment, responsibleIds: [p.id] },
                cache,
              )),
            })),
        ),
      })),
    );
    return {
      people,
      source:
        'Carteira atribuída atualmente; demais atividades pela autoria do evento. Propostas pelo responsável da versão enviada. Resultados individuais não devem ser somados: eventos compartilhados podem envolver mais de um responsável.',
      startsOn,
      endsOn,
    };
  }
}
