import type { SimulationInput, calculateSimulation, DiscountPoint } from './calculations.js';
export interface OfferingRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  baseCents: number | null;
  setupCents: number | null;
  monthlyCents: number | null;
  operatingCents: number | null;
  active: boolean;
  notes: string | null;
  version: number;
  priceHistory?: { id: string; version: number; snapshot: OfferingRecord; createdAt: string }[];
}
export interface PolicyRecord {
  id: string;
  rules: DiscountPoint[];
  provisional: boolean;
  version: number;
}
export interface ProposalInput extends SimulationInput {
  companyName: string;
  segment: 'ADVOCACIA' | 'CONTABILIDADE' | 'IMOBILIARIO';
  responsibleId: string;
  simulationDate: string;
  leadId?: string | null;
  currentSystem?: string;
  systemCount?: number;
  systemNotes?: string;
  problems?: string;
  requirements?: string;
  notes?: string;
  version?: number;
}
export type SimulationResult = ReturnType<typeof calculateSimulation> & {
  catalogueTotalCents: number | null;
  unpriced: boolean;
  policySnapshot: PolicyRecord;
  offeringSnapshots: OfferingRecord[];
  currency: string;
  months: number;
  manualException: boolean;
};
export interface ProposalRecord {
  id: string;
  companyName: string;
  segment: string;
  responsibleId: string;
  responsible?: { email: string };
  leadId: string | null;
  simulationDate: string;
  status: string;
  version: number;
  input: ProposalInput;
  result: SimulationResult;
  versions?: { id: string; version: number; createdAt: string; snapshot: ProposalRecord }[];
  updatedAt: string;
}
export interface CategoryRecord {
  id: string;
  name: string;
  group: 'GENERAL' | 'AI' | 'INFRA' | 'INVESTMENT';
  active: boolean;
  version: number;
}
export interface EntryRecord {
  id: string;
  requestKey: string;
  description: string;
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  competenceOn: string;
  dueOn: string | null;
  settledOn: string | null;
  status: 'PLANNED' | 'PENDING' | 'SETTLED' | 'CANCELLED';
  categoryId: string;
  categoryGroup: string;
  category?: CategoryRecord;
  counterparty: string | null;
  serviceReference: string | null;
  paymentMethod: string | null;
  notes: string | null;
  version: number;
  investment?: { id: string } | null;
  aiCost?: { id: string } | null;
}
export interface OpeningRecord {
  amountCents: number;
  effectiveOn: string;
  version: number;
}
export interface FinancialSummary {
  period: string;
  receivedCents: number;
  paidCents: number;
  balanceCents: number;
  resultCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  forecastCents: number;
  aiCents: number;
  infrastructureCents: number;
  investmentCents: number;
  opening: OpeningRecord | null;
  months: { period: string; incomeCents: number; expenseCents: number }[];
}
export interface RecurringRecord {
  id: string;
  description: string;
  amountCents: number;
  categoryId: string;
  dueDay: number;
  startsOn: string;
  endsOn: string | null;
  supplier: string | null;
  notes: string | null;
  active: boolean;
  version: number;
}
export interface InvestmentRecord {
  id: string;
  name: string;
  description: string | null;
  estimatedCents: number;
  actualCents: number | null;
  priority: string;
  status: string;
  plannedOn: string;
  categoryId: string;
  responsibleId: string;
  notes: string | null;
  transactionId: string | null;
  transaction?: EntryRecord | null;
  version: number;
}
export interface AiCostRecord {
  id: string;
  provider: string;
  modelService: string;
  amountCents: number;
  period: string;
  projectReference: string | null;
  unit: string | null;
  quantity: string | null;
  notes: string | null;
  transactionId: string | null;
  transaction?: EntryRecord | null;
  version: number;
}
export interface FinanceAuditRecord {
  id: string;
  action: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  createdAt: string;
  actor: { email: string };
}
