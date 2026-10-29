import { Injectable } from '@nestjs/common';
import type { GoalProgress, GoalStatus } from '@vympa/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { today } from '../clients/commercial-support.js';
import type { MetricResult } from './goal-metrics.service.js';
type ProgressGoal = {
  target: Prisma.Decimal | string;
  baseline: Prisma.Decimal | string | null;
  direction: string;
  unit: string;
  startsOn: Date;
  endsOn: Date;
  blocked: boolean;
  cancelledAt: Date | null;
};
export function calculateGoalProgress(
  g: ProgressGoal,
  r: MetricResult,
  asOf = today(),
): GoalProgress {
  const target = new Prisma.Decimal(g.target),
    baseline = g.baseline == null ? null : new Prisma.Decimal(g.baseline),
    value = r.value == null ? null : new Prisma.Decimal(r.value);
  const before = asOf < g.startsOn.toISOString().slice(0, 10),
    ended = asOf > g.endsOn.toISOString().slice(0, 10);
  let percent: number | null = null,
    remaining: string | null = null,
    withinLimit: boolean | null = null,
    status: GoalStatus = 'NOT_STARTED';
  if (value !== null) {
    const lower = g.direction !== 'GROWTH';
    const reached = lower ? value.lte(target) : value.gte(target);
    withinLimit = lower ? reached : null;
    remaining = (
      lower
        ? Prisma.Decimal.max(value.minus(target), 0)
        : Prisma.Decimal.max(target.minus(value), 0)
    ).toString();
    if (g.direction === 'LIMIT')
      percent = target.isZero() ? null : value.mul(100).div(target).toNumber();
    else if (g.direction === 'REDUCTION')
      percent =
        baseline && baseline.gt(target)
          ? baseline.minus(value).mul(100).div(baseline.minus(target)).toNumber()
          : null;
    else percent = target.isZero() ? null : value.mul(100).div(target).toNumber();
    status = before
      ? 'NOT_STARTED'
      : lower
        ? ended
          ? reached
            ? 'ACHIEVED'
            : 'OVERDUE'
          : reached
            ? 'IN_PROGRESS'
            : 'AT_RISK'
        : reached
          ? 'ACHIEVED'
          : ended
            ? 'OVERDUE'
            : value.isZero()
              ? 'NOT_STARTED'
              : 'IN_PROGRESS';
    if (!before && !ended && !lower && !reached) {
      const elapsed = Math.max(0, new Date(asOf + 'T00:00:00Z').getTime() - g.startsOn.getTime());
      const duration = Math.max(86400000, g.endsOn.getTime() - g.startsOn.getTime() + 86400000);
      if (percent !== null && elapsed / duration >= 0.5 && percent < (elapsed / duration) * 100)
        status = 'AT_RISK';
    }
  } else if (ended) status = 'OVERDUE';
  if (g.blocked && status !== 'ACHIEVED' && !before && !ended) status = 'AT_RISK';
  if (g.cancelledAt) status = 'CANCELLED';
  const barPercent =
    percent === null ? (status === 'ACHIEVED' ? 100 : 0) : Math.max(0, Math.min(100, percent));
  return {
    value: r.value,
    target: target.toString(),
    baseline: baseline?.toString() ?? null,
    unit: g.unit,
    percent,
    barPercent,
    remaining,
    status,
    withinLimit,
    available: value !== null,
    reason: r.reason,
    source: r.source,
    updatedAt: r.updatedAt,
    cutoff: r.cutoff,
    phase:
      g.direction === 'LIMIT'
        ? 'Consumo do limite'
        : g.direction === 'REDUCTION'
          ? 'Redução frente à base'
          : 'Alcance da meta',
  };
}
@Injectable()
export class GoalProgressService {
  calculate = calculateGoalProgress;
}
