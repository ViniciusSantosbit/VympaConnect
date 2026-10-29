import { describe, it, expect, jest } from '@jest/globals';
import { calculateSimulation, discountFor, parseMoney, provisionalRules } from '@vympa/shared';
import { SimulatorService } from '../dist/modules/finance/simulator.service.js';
import { ManagementService } from '../dist/modules/finance/management.service.js';
const input = { currentCostCents: 1000000, offeringCodes: ['CUSTOM_AI'], setupCents: 0 };
describe('Cálculos financeiros em centavos', () => {
  it.each([
    [0, 1000, 0],
    [100000, 1040, 89600],
    [500000, 1200, 440000],
    [1000000, 1400, 860000],
    [2000000, 1400, 1720000],
  ])('custo %s respeita a política provisória', (cost, discount, monthly) => {
    const r = calculateSimulation({ ...input, currentCostCents: cost });
    expect(r.discountBps).toBe(discount);
    expect(r.monthlyCents).toBe(monthly);
  });
  it('R$ 10.000 produz 14%, R$ 8.600, R$ 1.400 e R$ 16.800', () => {
    const r = calculateSimulation(input);
    expect([r.discountBps, r.monthlyCents, r.savingsCents, r.annualSavingsCents]).toEqual([
      1400, 860000, 140000, 1680000,
    ]);
  });
  it('implantação não reduz economia recorrente', () => {
    expect(calculateSimulation({ ...input, setupCents: 500000 }).annualSavingsCents).toBe(1680000);
  });
  it('não assume custos desconhecidos iguais a zero', () => {
    expect(calculateSimulation(input).contributionCents).toBeNull();
    expect(calculateSimulation({ ...input, infrastructureCents: 0 }).contributionCents).toBeNull();
  });
  it('zeros explícitos permitem calcular margem, sem prometer lucro líquido', () => {
    const r = calculateSimulation({
      ...input,
      infrastructureCents: 0,
      aiCents: 0,
      maintenanceCents: 0,
      supportCents: 0,
      otherCents: 0,
    });
    expect(r.contributionCents).toBe(860000);
  });
  it('custos superiores geram margem negativa e alerta', () => {
    const r = calculateSimulation({
      ...input,
      infrastructureCents: 900000,
      aiCents: 0,
      maintenanceCents: 0,
      supportCents: 0,
      otherCents: 0,
    });
    expect(r.contributionCents).toBe(-40000);
    expect(r.belowCosts).toBe(true);
  });
  it('proposta maior que custo atual mantém economia negativa', () => {
    expect(calculateSimulation({ ...input, manualMonthlyCents: 1200000 }).savingsCents).toBe(
      -200000,
    );
  });
  it('custo zero não divide por zero', () => {
    const r = calculateSimulation({ ...input, currentCostCents: 0 });
    expect(r.monthlyCents).toBe(0);
    expect(r.contributionBps).toBeNull();
  });
  it.each(['10000,99', '10.000,99', '10000.99'])('lê %s sem ponto flutuante', (v) => {
    expect(parseMoney(v)).toBe(1000099);
  });
  it('lê milhar pt-BR e mantém vazio como desconhecido', () => {
    expect(parseMoney('1.000')).toBe(100000);
    expect(parseMoney('')).toBeNull();
  });
  it.each(['-1', 'abc', '1,234', 'NaN', 'Infinity'])('recusa dinheiro inválido %s', (v) =>
    expect(() => parseMoney(v)).toThrow(),
  );
  it.each([-1, NaN, 1.5, 1000000001])('recusa centavos inválidos %s', (v) =>
    expect(() => calculateSimulation({ ...input, currentCostCents: v })).toThrow(),
  );
  it('não aceita duas exceções simultâneas', () =>
    expect(() =>
      calculateSimulation({ ...input, manualMonthlyCents: 1, manualDiscountBps: 1 }),
    ).toThrow());
  it('identifica escopo de IA sobreposto', () =>
    expect(
      calculateSimulation({ ...input, offeringCodes: ['CUSTOM_AI', 'AI_INTEGRATION'] }).overlap,
    ).toBe(true));
  it('permite configurar faixas acima dos 14% provisórios', () =>
    expect(
      discountFor(2000000, [...provisionalRules, { atCents: 2000000, discountBps: 2000 }]),
    ).toBe(2000));
  it.each([
    { rules: [{ atCents: 1, discountBps: 1000 }] },
    { rules: [{ atCents: 0, discountBps: 10001 }] },
    {
      rules: [
        { atCents: 0, discountBps: 1000 },
        { atCents: 0, discountBps: 1200 },
      ],
    },
  ])('recusa faixas inválidas', ({ rules }) => expect(() => discountFor(100, rules)).toThrow());
});
describe('Proteções do domínio financeiro', () => {
  it('ADMIN não pode definir mensalidade manual', async () => {
    await expect(
      new SimulatorService({}).calculate(
        { ...input, manualMonthlyCents: 1, exceptionReason: 'TESTE' },
        'ADMIN',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('OWNER precisa justificar exceção', async () => {
    await expect(
      new SimulatorService({}).calculate({ ...input, manualMonthlyCents: 1 }, 'OWNER'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('preços ainda não definidos permanecem nulos', async () => {
    const db = {
      discountPolicy: { findUnique: async () => null },
      serviceOffering: {
        findMany: async () => [{ code: 'CUSTOM_AI', active: true, monthlyCents: null }],
      },
    };
    const r = await new SimulatorService(db).calculate(input, 'ADMIN');
    expect(r.unpriced).toBe(true);
    expect(r.catalogueTotalCents).toBeNull();
  });
  it('recebimento exige data real', async () => {
    const tx = {
      $executeRaw: async () => 0,
      financialTransaction: { findUnique: async () => null, create: jest.fn() },
    };
    const db = { $transaction: (fn) => fn(tx) };
    await expect(
      new ManagementService(db).saveEntry(
        { requestKey: 'test', description: 'TESTE', status: 'SETTLED' },
        'actor',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });
  it('pagamento realizado não aceita data futura', async () => {
    const tx = {
      $executeRaw: async () => 0,
      financialTransaction: { findUnique: async () => null },
    };
    await expect(
      new ManagementService({ $transaction: (fn) => fn(tx) }).saveEntry(
        { requestKey: 'test', status: 'SETTLED', settledOn: '2099-01-01' },
        'actor',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
