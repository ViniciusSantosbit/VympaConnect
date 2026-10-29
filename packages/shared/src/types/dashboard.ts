export type DashboardMetric =
  | 'leads'
  | 'negotiations'
  | 'closedContracts'
  | 'activeClients'
  | 'monthlyRevenue'
  | 'monthlyExpenses'
  | 'balance'
  | 'goalProgress';

export interface DashboardSummary {
  generatedAt: string;
  goalIndicators?: import('./goals.js').GoalsSummary;
  relationships?: {
    totalClients: number;
    activeClients: number;
    onboarding: number;
    active: number;
    expired: number;
    pendingSignature: number;
    expiring: number;
    renewals: number;
    monthlyContractedCents: string | null;
    unpriced: number | null;
  };
  businessStatus: 'modules_pending' | 'prospecting_ready';
  prospecting?: {
    total: number;
    contacted: number;
    negotiating: number;
    won: number;
    lost: number;
  };
  metrics: Record<DashboardMetric, number | null>;
  finance: { period: string; revenue: number; expenses: number }[];
  commercial: { period: string; leads: number; negotiations: number }[];
  funnel: { label: string; count: number }[];
  contracts: { id: string; name: string; dueAt: string }[];
  goals: { id: string; name: string; dueAt: string; progress: number }[];
  activities: { id: string; label: string; occurredAt: string }[];
}
