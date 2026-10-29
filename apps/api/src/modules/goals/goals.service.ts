import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { goalMetricDefinitions, type GoalView, type GoalsSummary } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { expected, json } from '../finance/finance-support.js';
import { today, validDate } from '../clients/commercial-support.js';
import {
  GoalMetricsService,
  metricDefinition,
  metricWindow,
  type MetricResult,
} from './goal-metrics.service.js';
import { GoalProgressService } from './goal-progress.service.js';
import type {
  GoalDto,
  EditGoalDto,
  GoalFiltersDto,
  ManualGoalDto,
  GoalActionDto,
  GoalBlockerDto,
} from './goals.dto.js';
const include = {
  assignments: { include: { profile: { select: { id: true, email: true } } } },
} as const;
type GoalRow = Prisma.GoalGetPayload<{ include: typeof include }>;
const privateMetrics = goalMetricDefinitions.filter((m) => m.financial).map((m) => m.code);
export function goalsAccess(actor: string, role: string): Prisma.GoalWhereInput {
  return role === 'OWNER'
    ? {}
    : {
        category: { not: 'FINANCIAL' },
        metric: { notIn: privateMetrics },
        unit: { not: 'CENTS' },
        OR: [
          { assignments: { some: { profileId: actor } } },
          { scope: 'COMPANY', adminVisible: true },
        ],
      };
}
const owner = (role: string) => {
  if (role !== 'OWNER')
    throw new ForbiddenException('Somente OWNER pode configurar ou cancelar metas.');
};
@Injectable()
export class GoalsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly metrics: GoalMetricsService,
    private readonly progress: GoalProgressService,
  ) {}
  private async lock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(723118)`;
  }
  async require(id: string, actor: string, role: string, tx: Prisma.TransactionClient = this.db) {
    const g = await tx.goal.findFirst({
      where: { AND: [{ id }, goalsAccess(actor, role)] },
      include,
    });
    if (!g) throw new NotFoundException('Meta não encontrada ou não autorizada.');
    return g;
  }
  private async activity(
    tx: Prisma.TransactionClient,
    id: string,
    actor: string,
    kind: string,
    body: string,
    before?: unknown,
    after?: unknown,
  ) {
    await tx.goalActivity.create({
      data: {
        goalId: id,
        actorId: actor,
        kind,
        body,
        before: before == null ? Prisma.DbNull : json(before),
        after: after == null ? Prisma.DbNull : json(after),
      },
    });
    await tx.adminAuditEvent.create({
      data: { actorId: actor, action: 'GOAL_' + kind, targetId: id },
    });
  }
  private async validate(dto: GoalDto, tx: Prisma.TransactionClient) {
    const def = metricDefinition(dto.metric),
      start = validDate(dto.startsOn),
      end = validDate(dto.endsOn);
    metricWindow({ startsOn: dto.startsOn, endsOn: dto.endsOn });
    const target = new Prisma.Decimal(dto.target);
    if (target.gt('1000000000000'))
      throw new BadRequestException('Meta acima do limite de precisão permitido.');
    if (['COUNT', 'CENTS'].includes(def.unit) && !target.isInteger())
      throw new BadRequestException('Quantidades e centavos devem ser inteiros.');
    if (dto.scope === 'ASSIGNED' && !dto.assigneeIds.length)
      throw new BadRequestException('Selecione pelo menos um responsável.');
    if (dto.scope === 'ASSIGNED' && def.financial)
      throw new BadRequestException(
        'Indicadores financeiros usam escopo empresarial, sem atribuição automática de caixa. Os responsáveis podem acompanhar a meta.',
      );
    if (dto.assigneeIds.length) {
      const count = await tx.adminProfile.count({
        where: { id: { in: dto.assigneeIds }, active: true },
      });
      if (count !== dto.assigneeIds.length)
        throw new BadRequestException('Responsáveis precisam ser administradores ativos.');
    }
    if (
      (dto.category === 'FINANCIAL' && !def.financial) ||
      (def.financial && dto.category !== 'FINANCIAL')
    )
      throw new BadRequestException('Categoria incompatível com o indicador.');
    if (dto.mode === 'MANUAL' && !['MEETINGS', 'CUSTOM_ACTIVITY'].includes(dto.metric))
      throw new BadRequestException(
        'Este indicador é automático e não admite valor realizado manual.',
      );
    if (dto.mode === 'AUTO' && dto.allowManualUpdates)
      throw new BadRequestException('Metas automáticas não permitem atualizações manuais.');
    if (
      dto.direction !== 'GROWTH' &&
      !['PAID_EXPENSES', 'PAID_AI_COSTS', 'PAID_INFRA_COSTS'].includes(dto.metric)
    )
      throw new BadRequestException('Limites e redução são próprios de despesas pagas.');
    if (
      ['PAID_EXPENSES', 'PAID_AI_COSTS', 'PAID_INFRA_COSTS'].includes(dto.metric) &&
      dto.direction === 'GROWTH'
    )
      throw new BadRequestException('Despesas exigem direção de limite ou redução.');
    const baseline = dto.baseline === undefined ? null : new Prisma.Decimal(dto.baseline);
    if (dto.direction === 'REDUCTION' && (!baseline || !baseline.gt(target)))
      throw new BadRequestException('A base de custos deve superar o limite desejado.');
    if (
      baseline &&
      (baseline.gt('1000000000000') || (def.unit === 'CENTS' && !baseline.isInteger()))
    )
      throw new BadRequestException('Base de comparação inválida.');
    if (dto.mode === 'MANUAL' && dto.segment)
      throw new BadRequestException(
        'Metas manuais não permitem simular um recorte automático por segmento.',
      );
    const duration = (end.getTime() - start.getTime()) / 86400000 + 1;
    if (
      (dto.periodicity === 'WEEKLY' && duration !== 7) ||
      (dto.periodicity === 'MONTHLY' &&
        (start.getUTCDate() !== 1 ||
          end.getTime() !==
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 86400000)) ||
      (dto.periodicity === 'QUARTERLY' &&
        (start.getUTCDate() !== 1 ||
          start.getUTCMonth() % 3 !== 0 ||
          end.getTime() !==
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1) - 86400000)) ||
      (dto.periodicity === 'YEARLY' &&
        (dto.startsOn.slice(5) !== '01-01' || dto.endsOn !== dto.startsOn.slice(0, 4) + '-12-31'))
    )
      throw new BadRequestException(
        'Datas não correspondem à periodicidade. Use período personalizado para outras datas.',
      );
    return { unit: def.unit, target, baseline, startsOn: start, endsOn: end };
  }
  async create(dto: GoalDto, actor: string, role: string) {
    owner(role);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const old = await tx.goal.findUnique({ where: { requestKey: dto.requestKey }, include });
      if (old) {
        if (old.title !== dto.title || old.metric !== dto.metric || !old.target.eq(dto.target))
          throw new ConflictException('Chave de envio já utilizada em outra meta.');
        return old;
      }
      const values = await this.validate(dto, tx),
        { assigneeIds, ...data } = dto;
      const g = await tx.goal.create({
        data: {
          ...data,
          ...values,
          createdById: actor,
          assignments: { create: assigneeIds.map((profileId) => ({ profileId })) },
        },
        include,
      });
      await this.activity(tx, g.id, actor, 'CREATED', 'Meta cadastrada.', null, g);
      return g;
    });
  }
  async edit(id: string, dto: EditGoalDto, actor: string, role: string) {
    owner(role);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      if (before.cancelledAt) throw new ConflictException('Meta cancelada é histórico preservado.');
      for (const field of ['metric', 'mode', 'direction', 'requestKey'] as const)
        if (dto[field] !== undefined && dto[field] !== before[field])
          throw new BadRequestException(
            'Para trocar indicador, modo ou direção, cadastre uma nova meta.',
          );
      const { version, reason, assigneeIds, ...data } = dto;
      const merged = {
        ...before,
        ...data,
        target: dto.target ?? before.target.toString(),
        baseline: dto.baseline ?? before.baseline?.toString(),
        startsOn: dto.startsOn ?? before.startsOn.toISOString().slice(0, 10),
        endsOn: dto.endsOn ?? before.endsOn.toISOString().slice(0, 10),
        assigneeIds: assigneeIds ?? before.assignments.map((a) => a.profileId),
      } as GoalDto;
      const values = await this.validate(merged, tx);
      if (assigneeIds) {
        await tx.goalAssignment.deleteMany({ where: { goalId: id } });
        await tx.goalAssignment.createMany({
          data: assigneeIds.map((profileId) => ({ goalId: id, profileId })),
        });
      }
      const g = await tx.goal.update({
        where: { id },
        data: { ...data, ...values, version: version + 1 },
        include,
      });
      await this.activity(tx, id, actor, 'CONFIG_CHANGED', reason, before, g);
      return g;
    });
  }
  async view(
    g: GoalRow,
    asOf?: string,
    cache?: Map<string, Promise<MetricResult>>,
  ): Promise<GoalView> {
    const cutoff = asOf ?? today();
    metricWindow({
      startsOn: g.startsOn.toISOString().slice(0, 10),
      endsOn: g.endsOn.toISOString().slice(0, 10),
      asOf: cutoff,
    });
    let result: MetricResult;
    if (g.mode === 'MANUAL') {
      const limit =
        g.endsOn.toISOString().slice(0, 10) < cutoff ? g.endsOn.toISOString().slice(0, 10) : cutoff;
      const update = await this.db.goalManualUpdate.findFirst({
        where: {
          goalId: g.id,
          observedOn: { lte: validDate(limit) },
          createdAt: { lt: new Date(validDate(cutoff).getTime() + 27 * 3600000) },
        },
        orderBy: [{ observedOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      });
      result = {
        value: update?.value.toString() ?? null,
        reason: update ? null : 'Ainda não há valor manual registrado para a data de corte.',
        source: metricDefinition(g.metric).source,
        cutoff: limit,
        updatedAt: update?.createdAt.toISOString() ?? new Date().toISOString(),
      };
    } else
      result = await this.metrics.calculate(
        g.metric,
        {
          startsOn: g.startsOn.toISOString().slice(0, 10),
          endsOn: g.endsOn.toISOString().slice(0, 10),
          asOf: cutoff,
          segment: g.segment,
          responsibleIds:
            g.scope === 'ASSIGNED' ? g.assignments.map((a) => a.profileId).sort() : [],
        },
        cache,
      );
    return {
      ...(json(g) as unknown as GoalView),
      target: g.target.toString(),
      baseline: g.baseline?.toString() ?? null,
      progress: this.progress.calculate(g, result, cutoff),
    };
  }
  async get(id: string, actor: string, role: string, asOf?: string) {
    return this.view(await this.require(id, actor, role), asOf);
  }
  private where(q: GoalFiltersDto, actor: string, role: string): Prisma.GoalWhereInput {
    if (q.startsOn) validDate(q.startsOn);
    if (q.endsOn) validDate(q.endsOn);
    if (q.startsOn && q.endsOn && q.startsOn > q.endsOn)
      throw new BadRequestException('Período inválido.');
    return {
      AND: [
        goalsAccess(actor, role),
        {
          category: q.category,
          metric: q.metric,
          segment: q.segment,
          title: q.query ? { contains: q.query, mode: 'insensitive' } : undefined,
          assignments: q.responsibleId ? { some: { profileId: q.responsibleId } } : undefined,
          startsOn: q.endsOn ? { lte: validDate(q.endsOn) } : undefined,
          endsOn: q.startsOn ? { gte: validDate(q.startsOn) } : undefined,
        },
      ],
    };
  }
  async list(q: GoalFiltersDto, actor: string, role: string) {
    const cache = new Map<string, Promise<MetricResult>>();
    if (!q.status) {
      const where = this.where(q, actor, role);
      const [rows, total] = await Promise.all([
        this.db.goal.findMany({
          where,
          include,
          orderBy: [{ endsOn: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * 30,
          take: 30,
        }),
        this.db.goal.count({ where }),
      ]);
      return {
        items: await Promise.all(rows.map((g) => this.view(g, q.asOf, cache))),
        total,
        page: q.page,
        pageSize: 30,
      };
    }
    const rows = await this.db.goal.findMany({
      where: this.where(q, actor, role),
      include,
      orderBy: [{ endsOn: 'asc' }, { id: 'asc' }],
    });
    const views = await Promise.all(rows.map((g) => this.view(g, q.asOf, cache)));
    const filtered = q.status ? views.filter((g) => g.progress.status === q.status) : views;
    return {
      items: filtered.slice((q.page - 1) * 30, q.page * 30),
      total: filtered.length,
      page: q.page,
      pageSize: 30,
    };
  }
  async summary(actor: string, role: string): Promise<GoalsSummary> {
    const rows = await this.db.goal.findMany({
        where: goalsAccess(actor, role),
        include,
        orderBy: { endsOn: 'asc' },
      }),
      cache = new Map<string, Promise<MetricResult>>();
    const all = await Promise.all(rows.map((g) => this.view(g, undefined, cache)));
    const active = all.filter(
      (g) => !['CANCELLED', 'ACHIEVED', 'OVERDUE'].includes(g.progress.status),
    );
    const soon = active.filter((g) => {
      const days =
        (validDate(g.endsOn.slice(0, 10)).getTime() - validDate(today()).getTime()) / 86400000;
      return days >= 0 && days <= g.alertDays;
    });
    const commercial = all.filter(
      (g) =>
        g.category === 'COMMERCIAL' &&
        !g.cancelledAt &&
        g.startsOn.slice(0, 7) === today().slice(0, 7) &&
        g.periodicity === 'MONTHLY' &&
        g.progress.percent !== null,
    );
    return {
      total: all.length,
      active: active.length,
      achieved: all.filter((g) => g.progress.status === 'ACHIEVED').length,
      atRisk: all.filter((g) => g.progress.status === 'AT_RISK').length,
      overdue: all.filter((g) => g.progress.status === 'OVERDUE').length,
      expiring: soon.length,
      financialInProgress:
        role === 'OWNER' ? active.filter((g) => g.category === 'FINANCIAL').length : null,
      commercialProgress: commercial.length
        ? commercial.reduce((sum, g) => sum + g.progress.percent!, 0) / commercial.length
        : null,
      items: soon.slice(0, 5).map((g) => ({
        id: g.id,
        name: g.title,
        dueAt: g.endsOn,
        progress: g.progress.barPercent,
      })),
    };
  }
  async history(id: string, actor: string, role: string, page: number) {
    await this.require(id, actor, role);
    return this.db.goalActivity.findMany({
      where: { goalId: id },
      include: { actor: { select: { email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      skip: (page - 1) * 30,
    });
  }
  async manual(id: string, dto: ManualGoalDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const g = await this.require(id, actor, role, tx);
      if (g.mode !== 'MANUAL')
        throw new BadRequestException('Valor automático não pode ser sobrescrito manualmente.');
      if (role !== 'OWNER' && !g.allowManualUpdates)
        throw new ForbiddenException('Atualizações manuais não autorizadas.');
      if (g.cancelledAt) throw new ConflictException('Meta cancelada.');
      const existing = await tx.goalManualUpdate.findUnique({
        where: { requestKey: dto.requestKey },
      });
      if (existing) {
        if (
          existing.goalId !== id ||
          !existing.value.eq(dto.value) ||
          existing.observedOn.toISOString().slice(0, 10) !== dto.observedOn
        )
          throw new ConflictException('Chave já usada com outros dados.');
        return existing;
      }
      expected(g, dto.version);
      const observedOn = validDate(dto.observedOn),
        value = new Prisma.Decimal(dto.value);
      if (value.gt('1000000000000') || (g.unit === 'COUNT' && !value.isInteger()))
        throw new BadRequestException('Valor manual inválido.');
      if (observedOn < g.startsOn || observedOn > g.endsOn || dto.observedOn > today())
        throw new BadRequestException(
          'Informe uma data dentro da meta, sem antecipar eventos futuros.',
        );
      const last = await tx.goalManualUpdate.findFirst({
        where: { goalId: id },
        orderBy: { observedOn: 'desc' },
      });
      if (last && observedOn < last.observedOn)
        throw new ConflictException(
          'Registre atualizações em ordem de observação. Correções da última data exigem justificativa.',
        );
      const update = await tx.goalManualUpdate.create({
        data: {
          requestKey: dto.requestKey,
          goalId: id,
          actorId: actor,
          value,
          observedOn,
          reason: dto.reason,
          goalVersion: g.version,
        },
      });
      await tx.goal.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.activity(tx, id, actor, 'MANUAL_UPDATE', dto.reason, last, update);
      return update;
    });
  }
  async comment(id: string, body: string, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      await this.require(id, actor, role, tx);
      await this.activity(tx, id, actor, 'COMMENT', body);
      return { saved: true };
    });
  }
  async action(
    id: string,
    dto: GoalActionDto | GoalBlockerDto,
    actor: string,
    role: string,
    cancel = false,
  ) {
    if (cancel) owner(role);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      if (before.cancelledAt) throw new ConflictException('Meta já cancelada.');
      const row = await tx.goal.update({
        where: { id },
        data: {
          ...(cancel ? { cancelledAt: new Date() } : { blocked: (dto as GoalBlockerDto).blocked }),
          version: { increment: 1 },
        },
        include,
      });
      await this.activity(
        tx,
        id,
        actor,
        cancel ? 'CANCELLED' : 'BLOCKER_CHANGED',
        dto.reason,
        before,
        row,
      );
      return row;
    });
  }
  async snapshot(id: string, actor: string, role: string) {
    const view = await this.get(id, actor, role);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const g = await this.require(id, actor, role, tx);
      expected(g, view.version);
      const row = await tx.goalProgressSnapshot.create({
        data: { goalId: id, actorId: actor, goalVersion: g.version, data: json(view.progress) },
      });
      await this.activity(
        tx,
        id,
        actor,
        'SNAPSHOT',
        'Fotografia do cálculo; a fonte de verdade continua nos módulos de origem.',
        null,
        { snapshotId: row.id, goalVersion: g.version, progress: view.progress },
      );
      return row;
    });
  }
}
