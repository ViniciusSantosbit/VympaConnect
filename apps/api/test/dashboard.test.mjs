import { describe, it, expect, jest } from '@jest/globals';
import { DashboardService } from '../dist/modules/dashboard/dashboard.module.js';
const contracts = {
  summary: async () => ({
    active: 0,
    activeClients: 0,
    totalClients: 0,
    onboarding: 0,
    expired: 0,
    pendingSignature: 0,
    expiring: 0,
    renewals: 0,
    monthlyContractedCents: null,
    unpriced: null,
  }),
  expiring: async () => [],
};
const goals = {
  summary: async () => ({
    total: 0,
    active: 0,
    achieved: 0,
    atRisk: 0,
    overdue: 0,
    expiring: 0,
    financialInProgress: null,
    commercialProgress: null,
    items: [],
  }),
};
describe('Resumo inicial do dashboard', () => {
  it('mantém métricas indisponíveis e publica apenas eventos reais selecionados', async () => {
    const findMany = jest.fn(async () => [
      { id: 'event-1', action: 'MFA_VERIFIED', createdAt: new Date('2026-10-28T12:00:00Z') },
    ]);
    const result = await new DashboardService(
      {
        adminAuditEvent: { findMany },
        lead: { groupBy: async () => [] },
        leadEvent: { findMany: async () => [] },
      },
      undefined,
      contracts,
      goals,
    ).summary('profile-1', 'identity-1');
    expect(result.activities).toEqual([
      { id: 'event-1', label: 'Autenticador verificado', occurredAt: '2026-10-28T12:00:00.000Z' },
    ]);
    expect(result.metrics.leads).toBe(0);
    expect(result.metrics.closedContracts).toBe(0);
    for (const key of ['finance', 'commercial', 'contracts', 'goals'])
      expect(result[key]).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('identity-1');
  });
  it('retorna atividades vazias quando não há auditoria', async () => {
    const result = await new DashboardService(
      {
        adminAuditEvent: { findMany: async () => [] },
        lead: { groupBy: async () => [] },
        leadEvent: { findMany: async () => [] },
      },
      undefined,
      contracts,
      goals,
    ).summary('profile', 'identity');
    expect(result.activities).toEqual([]);
    expect(result.businessStatus).toBe('prospecting_ready');
  });
});
