import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { calculateGoalProgress } from '../dist/modules/goals/goal-progress.service.js';
import { GoalsService, goalsAccess } from '../dist/modules/goals/goals.service.js';
import { GoalMetricsService, metricWindow } from '../dist/modules/goals/goal-metrics.service.js';
import { GoalDto, ManualGoalDto } from '../dist/modules/goals/goals.dto.js';
const date = (s) => new Date(s + 'T00:00:00Z');
const base = {
  target: '100',
  baseline: null,
  direction: 'GROWTH',
  unit: 'COUNT',
  startsOn: date('2026-02-01'),
  endsOn: date('2026-02-28'),
  blocked: false,
  cancelledAt: null,
};
const result = (value) => ({
  value,
  reason: value === null ? 'Sem dados' : null,
  source: 'Teste isolado',
  cutoff: '2026-02-15',
  updatedAt: '2026-02-15T12:00:00Z',
});
describe('Progresso de metas com semântica explícita', () => {
  it.each([
    ['0', 0, 'NOT_STARTED'],
    ['75', 75, 'IN_PROGRESS'],
    ['100', 100, 'ACHIEVED'],
    ['150', 150, 'ACHIEVED'],
  ])('realizado %s mantém alcance %s', (value, percent, status) => {
    const p = calculateGoalProgress(base, result(value), '2026-02-10');
    expect(p.percent).toBe(percent);
    expect(p.status).toBe(status);
    expect(p.barPercent).toBe(Math.min(percent, 100));
  });
  it('meta superada permanece alcançada após o prazo', () =>
    expect(calculateGoalProgress(base, result('110'), '2026-03-01').status).toBe('ACHIEVED'));
  it('meta vencida insuficiente fica atrasada', () =>
    expect(calculateGoalProgress(base, result('90'), '2026-03-01').status).toBe('OVERDUE'));
  it('meta futura fica não iniciada', () =>
    expect(calculateGoalProgress(base, result(null), '2026-01-15').status).toBe('NOT_STARTED'));
  it('meta zero não divide por zero nem gera NaN', () => {
    const p = calculateGoalProgress({ ...base, target: '0' }, result('0'), '2026-02-15');
    expect(p.percent).toBeNull();
    expect(p.status).toBe('ACHIEVED');
    expect(p.remaining).toBe('0');
  });
  it('meta sem dados permanece indisponível', () => {
    const p = calculateGoalProgress(base, result(null), '2026-02-15');
    expect(p.available).toBe(false);
    expect(p.percent).toBeNull();
    expect(p.value).toBeNull();
  });
  it('limite baixo de despesas não é fracasso e só conclui ao fechar o período', () => {
    const g = { ...base, direction: 'LIMIT' };
    expect(calculateGoalProgress(g, result('20'), '2026-02-10')).toMatchObject({
      withinLimit: true,
      status: 'IN_PROGRESS',
      percent: 20,
    });
    expect(calculateGoalProgress(g, result('20'), '2026-03-01').status).toBe('ACHIEVED');
  });
  it('estouro de limite fica em risco e depois atrasado', () => {
    const g = { ...base, direction: 'LIMIT' };
    expect(calculateGoalProgress(g, result('150'), '2026-02-10').status).toBe('AT_RISK');
    expect(calculateGoalProgress(g, result('150'), '2026-03-01').status).toBe('OVERDUE');
  });
  it('limite zero admite gasto zero e recusa divisão inválida', () => {
    const p = calculateGoalProgress(
      { ...base, direction: 'LIMIT', target: '0' },
      result('0'),
      '2026-03-01',
    );
    expect(p.status).toBe('ACHIEVED');
    expect(p.percent).toBeNull();
  });
  it('redução usa a base e permite superar 100%', () => {
    const p = calculateGoalProgress(
      { ...base, direction: 'REDUCTION', baseline: '200', target: '100' },
      result('50'),
      '2026-03-01',
    );
    expect(p.percent).toBe(150);
    expect(p.status).toBe('ACHIEVED');
    expect(p.barPercent).toBe(100);
  });
  it('valores decimais exatos preservam restante', () =>
    expect(
      calculateGoalProgress({ ...base, target: '2.25' }, result('1.125'), '2026-02-10'),
    ).toMatchObject({ remaining: '1.125', percent: 50 }));
  it('cancelamento prevalece e impedimento é auditável sem inventar realização', () => {
    expect(
      calculateGoalProgress({ ...base, cancelledAt: new Date() }, result('100'), '2026-02-10')
        .status,
    ).toBe('CANCELLED');
    expect(
      calculateGoalProgress({ ...base, blocked: true }, result('10'), '2026-02-10').status,
    ).toBe('AT_RISK');
  });
});
describe('Indicadores e autorização', () => {
  it.each(['2026-02-30', '2026-13-01'])('recusa datas impossíveis %s', (s) =>
    expect(() => metricWindow({ startsOn: s, endsOn: s })).toThrow(),
  );
  it('não transforma notas ou estados em reuniões', async () => {
    const db = { $queryRaw: jest.fn() };
    const r = await new GoalMetricsService(db).calculate('MEETINGS', {
      startsOn: '2026-02-01',
      endsOn: '2026-02-28',
    });
    expect(r.value).toBeNull();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('não inventa rateio de receita por serviço', async () =>
    expect(
      (
        await new GoalMetricsService({}).calculate('RECEIVED_SERVICE', {
          startsOn: '2026-02-01',
          endsOn: '2026-02-28',
        })
      ).value,
    ).toBeNull());
  it('não atribui caixa automaticamente a um sócio', async () =>
    expect(
      (
        await new GoalMetricsService({}).calculate('RECEIVED_INCOME', {
          startsOn: '2026-02-01',
          endsOn: '2026-02-28',
          responsibleIds: ['a'],
        })
      ).value,
    ).toBeNull());
  it('não infere crescimento percentual com mês parcial', async () =>
    expect(
      (
        await new GoalMetricsService({}).calculate('MONTHLY_GROWTH', {
          startsOn: '2026-02-02',
          endsOn: '2026-02-28',
        })
      ).value,
    ).toBeNull());
  it('reutiliza cálculo idêntico somente dentro da requisição', async () => {
    const db = { $queryRaw: jest.fn(async () => [{ value: '2' }]) };
    const s = new GoalMetricsService(db),
      cache = new Map(),
      c = { startsOn: '2026-02-01', endsOn: '2026-02-28' };
    await Promise.all([s.calculate('NEW_LEADS', c, cache), s.calculate('NEW_LEADS', c, cache)]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'edit'])('ADMIN não configura por %s', async (method) => {
    const service = new GoalsService({}, {}, {});
    await expect(
      method === 'create'
        ? service.create({}, 'actor', 'ADMIN')
        : service.edit('id', {}, 'actor', 'ADMIN'),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('escopo ADMIN sempre exclui metas financeiras mesmo se atribuídas', () =>
    expect(goalsAccess('actor', 'ADMIN')).toMatchObject({
      category: { not: 'FINANCIAL' },
      unit: { not: 'CENTS' },
      metric: { notIn: expect.arrayContaining(['RECEIVED_INCOME', 'MONTHLY_GROWTH']) },
    }));
  it('meta automática não aceita atualização manual nem pela OWNER', async () => {
    const tx = { $executeRaw: async () => 0, goal: { findFirst: async () => ({ mode: 'AUTO' }) } };
    await expect(
      new GoalsService({ $transaction: (fn) => fn(tx) }, {}, {}).manual('id', {}, 'owner', 'OWNER'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('DTO exige representação decimal exata em string', async () => {
    const r = await validate(
      plainToInstance(ManualGoalDto, {
        requestKey: '11111111-1111-4111-8111-111111111111',
        version: 1,
        value: 1.2,
        observedOn: '2026-02-15',
        reason: 'Observação de teste',
      }),
    );
    expect(r.some((e) => e.property === 'value')).toBe(true);
  });
  it('DTO não aceita alvos negativos', async () =>
    expect(
      (await validate(plainToInstance(GoalDto, { target: '-1' }))).some(
        (e) => e.property === 'target',
      ),
    ).toBe(true));
});
