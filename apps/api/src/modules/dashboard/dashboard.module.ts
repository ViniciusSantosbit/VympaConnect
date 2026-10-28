import { Controller, Get, Injectable, Module, Req, Header } from '@nestjs/common';
import type { DashboardSummary } from '@vympa/shared';
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
  constructor(private readonly db: DatabaseService) {}

  async summary(profileId: string, identityId: string): Promise<DashboardSummary> {
    const events = await this.db.adminAuditEvent.findMany({
      where: {
        action: { in: Object.keys(activityLabels) },
        OR: [{ actorId: profileId }, { targetId: identityId }, { targetId: profileId }],
      },
      select: { id: true, action: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
    // Ausência de módulos não significa faturamento zero. Os futuros domínios
    // fornecerão suas agregações aqui quando existirem tabelas e regras reais.
    return {
      generatedAt: new Date().toISOString(),
      businessStatus: 'modules_pending',
      metrics: {
        leads: null,
        negotiations: null,
        closedContracts: null,
        activeClients: null,
        monthlyRevenue: null,
        monthlyExpenses: null,
        balance: null,
        goalProgress: null,
      },
      finance: [],
      commercial: [],
      funnel: [],
      contracts: [],
      goals: [],
      activities: events.map((event) => ({
        id: event.id,
        label: activityLabels[event.action]!,
        occurredAt: event.createdAt.toISOString(),
      })),
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(@Req() request: AuthRequest) {
    return this.dashboard.summary(request.auth.profile!.id, request.auth.identity.id);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
