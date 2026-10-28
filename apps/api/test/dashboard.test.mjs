import { describe, it, expect, jest } from '@jest/globals';
import { DashboardService } from '../dist/modules/dashboard/dashboard.module.js';
describe('Resumo inicial do dashboard', () => {
  it('mantém métricas indisponíveis e publica apenas eventos reais selecionados', async () => {
    const findMany = jest.fn(async () => [
      { id: 'event-1', action: 'MFA_VERIFIED', createdAt: new Date('2026-10-28T12:00:00Z') },
    ]);
    const result = await new DashboardService({
      adminAuditEvent: { findMany },
      lead: { groupBy: async () => [] },
      leadEvent: { findMany: async () => [] },
    }).summary('profile-1', 'identity-1');
    expect(result.activities).toEqual([
      { id: 'event-1', label: 'Autenticador verificado', occurredAt: '2026-10-28T12:00:00.000Z' },
    ]);
    expect(result.metrics.leads).toBe(0);
    expect(result.metrics.closedContracts).toBeNull();
    for (const key of ['finance', 'commercial', 'contracts', 'goals'])
      expect(result[key]).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('identity-1');
  });
  it('retorna atividades vazias quando não há auditoria', async () => {
    const result = await new DashboardService({
      adminAuditEvent: { findMany: async () => [] },
      lead: { groupBy: async () => [] },
      leadEvent: { findMany: async () => [] },
    }).summary('profile', 'identity');
    expect(result.activities).toEqual([]);
    expect(result.businessStatus).toBe('prospecting_ready');
  });
});
