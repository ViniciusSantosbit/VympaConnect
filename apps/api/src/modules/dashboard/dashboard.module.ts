import { FinanceModule } from '../finance/finance.module.js';
import { ManagementService } from '../finance/management.service.js';
import { Controller, Get, Injectable, Module, Req, Header } from '@nestjs/common';
import type { DashboardSummary } from '@vympa/shared';
import { statusLabels } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthRequest } from '../auth/auth.types.js';

const activityLabels: Record<string, string> = {
  LOGIN: 'Login realizado',
  MFA_VERIFIED: 'Autenticador verificado',
  LOGOUT: 'Sessão encerrada',
  PASSWORD_CHANGED: 'Senha alterada',
  OWNER_BOOTSTRAPPED_OFFLINE: 'Acesso OWNER provisionado',
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly finance: ManagementService,
  ) {}

  async summary(profileId: string, identityId: string, role?: string): Promise<DashboardSummary> {
    const events = await this.db.adminAuditEvent.findMany({
      where: {
        action: { in: Object.keys(activityLabels) },
        OR: [{ actorId: profileId }, { targetId: identityId }, { targetId: profileId }],
      },
      select: { id: true, action: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
    const groups = await this.db.lead.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
    const total = groups.reduce((sum, group) => sum + group._count._all, 0);
    const commercial = await this.db.leadEvent.findMany({
      select: { id: true, kind: true, newStatus: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const financial = role === 'OWNER' ? await this.finance.summary() : null;
    // Ausência de módulos não significa faturamento zero. Os futuros domínios
    // fornecerão suas agregações aqui quando existirem tabelas e regras reais.
    return {
      generatedAt: new Date().toISOString(),
      businessStatus: 'prospecting_ready',
      prospecting: {
        total,
        contacted: counts.CONTACTED ?? 0,
        negotiating: counts.NEGOTIATING ?? 0,
        won: counts.WON ?? 0,
        lost: counts.LOST ?? 0,
      },
      metrics: {
        leads: total,
        negotiations: counts.NEGOTIATING ?? 0,
        closedContracts: null,
        activeClients: null,
        monthlyRevenue: financial ? financial.receivedCents / 100 : null,
        monthlyExpenses: financial ? financial.paidCents / 100 : null,
        balance: financial ? financial.balanceCents / 100 : null,
        goalProgress: null,
      },
      finance: financial
        ? financial.months.map((m) => ({
            period: m.period,
            revenue: m.incomeCents / 100,
            expenses: m.expenseCents / 100,
          }))
        : [],
      commercial: [],
      funnel: Object.entries(statusLabels).map(([status, label]) => ({
        label,
        count: counts[status] ?? 0,
      })),
      contracts: [],
      goals: [],
      activities: [
        ...events.map((event) => ({
          id: event.id,
          label: activityLabels[event.action]!,
          occurredAt: event.createdAt.toISOString(),
        })),
        ...commercial.map((event) => ({
          id: event.id,
          label:
            event.kind === 'STATUS' && event.newStatus
              ? `Negociação: ${statusLabels[event.newStatus]}`
              : event.kind === 'INTERACTION'
                ? 'Contato comercial registrado'
                : event.kind === 'NOTE'
                  ? 'Nota comercial adicionada'
                  : event.kind === 'CREATED'
                    ? 'Lead cadastrado'
                    : 'Acompanhamento comercial atualizado',
          occurredAt: event.createdAt.toISOString(),
        })),
      ]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 5),
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(@Req() request: AuthRequest) {
    return this.dashboard.summary(
      request.auth.profile!.id,
      request.auth.identity.id,
      request.auth.profile!.role,
    );
  }
}

@Module({
  imports: [FinanceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
