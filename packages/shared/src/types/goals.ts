export const goalMetricDefinitions = [
  {
    code: 'NEW_LEADS',
    label: 'Novos leads',
    unit: 'COUNT',
    financial: false,
    source: 'Leads criados no período; autoria do cadastro.',
  },
  {
    code: 'CONTACTED_LEADS',
    label: 'Leads efetivamente contatados',
    unit: 'COUNT',
    financial: false,
    source:
      'Leads distintos com interação estruturada no período; autor do contato. Status e notas não contam.',
  },
  {
    code: 'MEETINGS',
    label: 'Reuniões realizadas',
    unit: 'COUNT',
    financial: false,
    source: 'Registro manual justificado; o CRM não registra reuniões estruturadas.',
  },
  {
    code: 'SENT_PROPOSALS',
    label: 'Propostas enviadas',
    unit: 'COUNT',
    financial: false,
    source:
      'Versões históricas no estado SENT; responsável na versão enviada; propostas distintas.',
  },
  {
    code: 'WON_NEGOTIATIONS',
    label: 'Negociações ganhas',
    unit: 'COUNT',
    financial: false,
    source: 'Leads distintos com transição WON no período; autor da transição.',
  },
  {
    code: 'NEGOTIATIONS_STARTED',
    label: 'Negociações conduzidas',
    unit: 'COUNT',
    financial: false,
    source:
      'Leads distintos com transição NEGOTIATING no período; autor da transição. Reaberturas não duplicam o lead.',
  },
  {
    code: 'NEW_CLIENTS',
    label: 'Novos clientes',
    unit: 'COUNT',
    financial: false,
    source: 'Clientes criados no período; autoria do primeiro evento de cadastro ou conversão.',
  },
  {
    code: 'SIGNED_CONTRACTS',
    label: 'Contratos formalizados',
    unit: 'COUNT',
    financial: false,
    source:
      'Contratos distintos com evento de assinatura SIGNED no período; autor da formalização.',
  },
  {
    code: 'ACTIVATED_CONTRACTS',
    label: 'Contratos ativados',
    unit: 'COUNT',
    financial: false,
    source: 'Contratos distintos com evento ACTIVE no período; autor da ativação.',
  },
  {
    code: 'CONVERSION_RATE',
    label: 'Taxa de conversão da coorte',
    unit: 'PERCENT',
    financial: false,
    source:
      'Leads cadastrados no período e vinculados a cliente até o fim do período ÷ leads da mesma coorte. Autoria do cadastro.',
  },
  {
    code: 'COMPLETED_ACTIVITIES',
    label: 'Acompanhamentos concluídos',
    unit: 'COUNT',
    financial: false,
    source:
      'Eventos estruturados FOLLOW_UP_DONE; autor da conclusão, sem inferir atividades por notas.',
  },
  {
    code: 'RECEIVED_INCOME',
    label: 'Receita recebida',
    unit: 'CENTS',
    financial: true,
    source:
      'Financeiro conciliado: INCOME SETTLED por settledOn. Correções posteriores podem reapresentar o histórico.',
  },
  {
    code: 'EXPECTED_INCOME',
    label: 'Receita prevista',
    unit: 'CENTS',
    financial: true,
    source:
      'Pendências PLANNED/PENDING por dueOn ou competência quando sem vencimento. Não é caixa.',
  },
  {
    code: 'PAID_EXPENSES',
    label: 'Despesas pagas',
    unit: 'CENTS',
    financial: true,
    source: 'EXPENSE SETTLED por settledOn. Limites e redução usam regras próprias.',
  },
  {
    code: 'PAID_AI_COSTS',
    label: 'Custos de IA pagos',
    unit: 'CENTS',
    financial: true,
    source: 'Despesas SETTLED classificadas como AI, por data efetiva de caixa.',
  },
  {
    code: 'PAID_INFRA_COSTS',
    label: 'Custos de infraestrutura pagos',
    unit: 'CENTS',
    financial: true,
    source: 'Despesas SETTLED classificadas como INFRA, por data efetiva de caixa.',
  },
  {
    code: 'CASH_RESULT',
    label: 'Resultado de caixa do período',
    unit: 'CENTS',
    financial: true,
    source: 'Receitas recebidas menos despesas pagas no período; não inclui saldo inicial.',
  },
  {
    code: 'CONTRACTED_MRR',
    label: 'MRR contratado',
    unit: 'CENTS',
    financial: true,
    source:
      'Mensalidades de contratos ativos na data de corte, reconstruídas pelo histórico e aditivos; exclui cobrança única. Não é caixa.',
  },
  {
    code: 'PLANNED_INVESTMENTS',
    label: 'Investimentos planejados',
    unit: 'CENTS',
    financial: true,
    source:
      'Investimentos PLANNED/APPROVED pela data planejada; previsão atual, sem confundir com execução.',
  },
  {
    code: 'EXECUTED_INVESTMENTS',
    label: 'Investimentos executados',
    unit: 'CENTS',
    financial: true,
    source: 'Despesas liquidadas vinculadas a investimentos pela data efetiva de caixa.',
  },
  {
    code: 'RECEIVED_SERVICE',
    label: 'Receita por serviço',
    unit: 'CENTS',
    financial: true,
    source:
      'Indisponível: lançamentos não possuem rateio estruturado por operação. Não é seguro repartir contratos com múltiplos serviços.',
  },
  {
    code: 'MONTHLY_GROWTH',
    label: 'Crescimento de receitas recebidas',
    unit: 'PERCENT',
    financial: true,
    source:
      'Comparação de meses completos consecutivos; mês incompleto ou base anterior zero retorna indisponível.',
  },
  {
    code: 'CUSTOM_ACTIVITY',
    label: 'Objetivo operacional manual',
    unit: 'NUMBER',
    financial: false,
    source: 'Valor absoluto informado com data, justificativa, responsável e histórico.',
  },
] as const;
export type GoalMetricCode = (typeof goalMetricDefinitions)[number]['code'];
export const goalStatuses = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'ACHIEVED',
  'AT_RISK',
  'OVERDUE',
  'CANCELLED',
] as const;
export type GoalStatus = (typeof goalStatuses)[number];
export interface GoalProgress {
  value: string | null;
  target: string;
  baseline: string | null;
  unit: string;
  percent: number | null;
  barPercent: number;
  remaining: string | null;
  status: GoalStatus;
  withinLimit: boolean | null;
  available: boolean;
  reason: string | null;
  source: string;
  updatedAt: string;
  cutoff: string;
  phase: string;
}
export interface GoalView {
  id: string;
  title: string;
  description: string | null;
  category: string;
  metric: GoalMetricCode;
  mode: 'AUTO' | 'MANUAL';
  direction: 'GROWTH' | 'LIMIT' | 'REDUCTION';
  unit: string;
  target: string;
  baseline: string | null;
  startsOn: string;
  endsOn: string;
  priority: string;
  periodicity: string;
  segment: string | null;
  scope: string;
  adminVisible: boolean;
  allowManualUpdates: boolean;
  alertDays: number;
  notes: string | null;
  blocked: boolean;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  assignments: { profileId: string; profile: { id: string; email: string } }[];
  progress: GoalProgress;
}
export interface GoalsSummary {
  total: number;
  active: number;
  achieved: number;
  atRisk: number;
  overdue: number;
  expiring: number;
  financialInProgress: number | null;
  commercialProgress: number | null;
  items: { id: string; name: string; dueAt: string; progress: number }[];
}
