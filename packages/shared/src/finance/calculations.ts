export const moneyLimit = 1_000_000_000;
export const offeringCodes = [
  'CUSTOM_AI',
  'DOCUMENT_AUTOMATION',
  'SECTOR_PROCESSES',
  'AI_INTEGRATION',
] as const;
export const offeringDefaults = [
  {
    code: 'CUSTOM_AI',
    name: 'Sistema personalizado + IA',
    description:
      'Sistema independente com identidade do cliente, banco de dados, APIs autorizadas, assistente de IA, manutenção e suporte.',
  },
  {
    code: 'DOCUMENT_AUTOMATION',
    name: 'Automação de documentos',
    description:
      'Organização, extração, classificação, aprovações, integrações, relatórios e OCR quando aplicável.',
  },
  {
    code: 'SECTOR_PROCESSES',
    name: 'Gestão de processos por setor',
    description:
      'Atividades, responsáveis, prazos, status, relatórios, permissões e fluxos por setor.',
  },
  {
    code: 'AI_INTEGRATION',
    name: 'Implementação de IA',
    description:
      'Assistentes, consulta e análise de documentos e automação por APIs e integrações autorizadas.',
  },
] as const;
export interface DiscountPoint {
  atCents: number;
  discountBps: number;
}
export const provisionalRules: DiscountPoint[] = [
  { atCents: 0, discountBps: 1000 },
  { atCents: 1000000, discountBps: 1400 },
];
export interface SimulationInput {
  currentCostCents: number;
  offeringCodes: string[];
  setupCents: number;
  infrastructureCents?: number | null;
  aiCents?: number | null;
  maintenanceCents?: number | null;
  supportCents?: number | null;
  otherCents?: number | null;
  developmentMinutes?: number | null;
  hourlyCents?: number | null;
  manualDiscountBps?: number;
  manualMonthlyCents?: number;
  exceptionReason?: string;
  bundleScope?: string;
}
export function roundedRatio(n: bigint, d: bigint): number {
  if (d <= 0n) throw new Error('Divisor inválido');
  const sign = n < 0n ? -1n : 1n;
  const abs = n * sign;
  const value = sign * ((abs + d / 2n) / d);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Valor fora da precisão suportada');
  return result;
}
export function discountFor(cost: number, rules: DiscountPoint[]): number {
  if (
    !Number.isSafeInteger(cost) ||
    cost < 0 ||
    cost > moneyLimit ||
    !rules.length ||
    rules[0]!.atCents !== 0
  )
    throw new Error('Dados de desconto inválidos');
  for (let i = 0; i < rules.length; i++) {
    const p = rules[i]!;
    if (
      !Number.isInteger(p.atCents) ||
      p.atCents < 0 ||
      p.atCents > moneyLimit ||
      !Number.isInteger(p.discountBps) ||
      p.discountBps < 0 ||
      p.discountBps > 10000 ||
      (i > 0 && p.atCents <= rules[i - 1]!.atCents)
    )
      throw new Error('Faixas inválidas');
  }
  for (let i = 1; i < rules.length; i++) {
    const a = rules[i - 1]!,
      b = rules[i]!;
    if (cost <= b.atCents)
      return (
        a.discountBps +
        roundedRatio(
          BigInt(cost - a.atCents) * BigInt(b.discountBps - a.discountBps),
          BigInt(b.atCents - a.atCents),
        )
      );
  }
  return rules[rules.length - 1]!.discountBps;
}
export function calculateSimulation(
  input: SimulationInput,
  rules: DiscountPoint[] = provisionalRules,
) {
  for (const value of [
    input.currentCostCents,
    input.setupCents,
    input.infrastructureCents,
    input.aiCents,
    input.maintenanceCents,
    input.supportCents,
    input.otherCents,
    input.hourlyCents,
    input.manualMonthlyCents,
  ]) {
    if (value != null && (!Number.isSafeInteger(value) || value < 0 || value > moneyLimit))
      throw new Error(
        'Valores monetários devem ser centavos inteiros não negativos dentro do limite.',
      );
  }
  if (
    input.manualDiscountBps != null &&
    (!Number.isInteger(input.manualDiscountBps) ||
      input.manualDiscountBps < 0 ||
      input.manualDiscountBps > 10000)
  )
    throw new Error('Percentual inválido.');
  if (input.manualMonthlyCents != null && input.manualDiscountBps != null)
    throw new Error('Informe apenas uma exceção comercial.');
  if (
    input.developmentMinutes != null &&
    (!Number.isInteger(input.developmentMinutes) || input.developmentMinutes < 0)
  )
    throw new Error('Tempo de desenvolvimento inválido.');
  if (
    new Set(input.offeringCodes).size !== input.offeringCodes.length ||
    input.offeringCodes.some((code) => !(offeringCodes as readonly string[]).includes(code))
  )
    throw new Error('Serviços inválidos.');
  const discountBps = input.manualDiscountBps ?? discountFor(input.currentCostCents, rules);
  const monthlyCents =
    input.manualMonthlyCents ??
    roundedRatio(BigInt(input.currentCostCents) * BigInt(10000 - discountBps), 10000n);
  const savingsCents = input.currentCostCents - monthlyCents;
  const costs = [
    input.infrastructureCents,
    input.aiCents,
    input.maintenanceCents,
    input.supportCents,
    input.otherCents,
  ];
  const operatingCents = costs.every((v) => v !== undefined && v !== null)
    ? costs.reduce<number>((sum, v) => sum + v!, 0)
    : null;
  const contributionCents = operatingCents === null ? null : monthlyCents - operatingCents;
  const effectiveDiscountBps = input.currentCostCents
    ? roundedRatio(BigInt(savingsCents) * 10000n, BigInt(input.currentCostCents))
    : null;
  return {
    monthlyCents,
    discountBps: input.manualMonthlyCents === undefined ? discountBps : effectiveDiscountBps,
    savingsCents,
    annualSavingsCents: savingsCents * 12,
    operatingCents,
    contributionCents,
    contributionBps:
      contributionCents !== null && monthlyCents > 0
        ? roundedRatio(BigInt(contributionCents) * 10000n, BigInt(monthlyCents))
        : null,
    setupCents: input.setupCents,
    estimatedDevelopmentCents:
      input.developmentMinutes != null && input.hourlyCents != null
        ? roundedRatio(BigInt(input.developmentMinutes) * BigInt(input.hourlyCents), 60n)
        : null,
    belowCosts: contributionCents !== null && contributionCents < 0,
    overlap:
      input.offeringCodes.includes('CUSTOM_AI') && input.offeringCodes.includes('AI_INTEGRATION'),
  };
}
export function parseMoney(value: string): number | null {
  const clean = value.trim().replace(/\s|R\$/g, '');
  if (!clean) return null;
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(clean)
    ? clean.replace(/\./g, '')
    : clean.includes(',')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error('Informe um valor com até duas casas decimais');
  const [units, fraction = ''] = normalized.split('.');
  const cents = Number(BigInt(units!) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(cents) || cents > moneyLimit)
    throw new Error('Valor acima do limite por lançamento');
  return cents;
}
export function brl(cents: number | null | undefined): string {
  return cents == null
    ? 'Não calculado'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
