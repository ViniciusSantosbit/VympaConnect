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
  businessStatus: 'modules_pending';
  metrics: Record<DashboardMetric, number | null>;
  finance: { period: string; revenue: number; expenses: number }[];
  commercial: { period: string; leads: number; negotiations: number }[];
  funnel: { label: string; count: number }[];
  contracts: { id: string; name: string; dueAt: string }[];
  goals: { id: string; name: string; dueAt: string; progress: number }[];
  activities: { id: string; label: string; occurredAt: string }[];
}
