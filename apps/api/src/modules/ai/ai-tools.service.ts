import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { FunctionDeclaration } from '@google/genai';
import { leadStatuses } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import { ProspectingService } from '../prospecting/prospecting.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { ManagementService } from '../finance/management.service.js';
import { SimulatorService } from '../finance/simulator.service.js';
import { GoalsService } from '../goals/goals.service.js';
import { today } from '../clients/commercial-support.js';
export type AiActor = { id: string; role: 'OWNER' | 'ADMIN' };
const page = z.number().int().min(1).max(100).default(1),
  query = z.string().trim().max(100).optional(),
  id = z.uuid().optional();
const period = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
  .optional();
const schemas = {
  consult_crm: z.object({ page, query, status: z.enum(leadStatuses).optional() }).strict(),
  consult_clients: z
    .object({
      page,
      query,
      status: z.enum(['PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE']).optional(),
    })
    .strict(),
  consult_contracts: z
    .object({
      page,
      id,
      period,
      status: z
        .enum([
          'DRAFT',
          'PENDING_SIGNATURE',
          'SIGNED',
          'ACTIVE',
          'EXPIRED',
          'TERMINATED',
          'CANCELLED',
        ])
        .optional(),
    })
    .strict(),
  consult_finance: z.object({ period }).strict(),
  consult_proposals: z.object({ page, id }).strict(),
  consult_goals: z
    .object({
      page,
      query,
      status: z
        .enum(['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'AT_RISK', 'OVERDUE', 'CANCELLED'])
        .optional(),
      category: z.enum(['COMMERCIAL', 'FINANCIAL', 'TEAM']).optional(),
    })
    .strict(),
};
const descriptions = {
  consult_crm:
    'Consultar leads próprios do CRM e próximas ações. Sem busca externa nem alteração de status.',
  consult_clients: 'Consultar empresas e status do relacionamento autorizados.',
  consult_contracts:
    'Consultar contratos autorizados. period YYYY-MM filtra vencimentos no mês antes da paginação.',
  consult_finance:
    'OWNER: consultar caixa recebido, despesas, saldo e previsões do mês. Não confundir previsto com recebido.',
  consult_proposals:
    'Consultar propostas e sua economia estimada, sem alterar preços ou transformar simulação em receita.',
  consult_goals:
    'Consultar metas e progresso autorizados, incluindo atrasos. Nunca atualizar realização.',
};
export function aiToolDeclarations(role: AiActor['role']): FunctionDeclaration[] {
  return Object.entries(schemas)
    .filter(([name]) => role === 'OWNER' || name !== 'consult_finance')
    .map(([name, schema]) => ({
      name,
      description: descriptions[name as keyof typeof descriptions],
      parametersJsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }),
    }));
}
const cut = (s: string | null | undefined, max = 180) => s?.slice(0, max) ?? null;
function paging<T>(items: T[], total: number | undefined, page: number) {
  const offset = ((page - 1) % 3) * 10,
    rows = items.slice(offset, offset + 10),
    hasMore =
      total === undefined ? items.length > offset + 10 || items.length === 30 : page * 10 < total;
  return {
    items: rows,
    page,
    pageSize: 10,
    total: total ?? null,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    partial: hasMore || page > 1,
  };
}
export const aiSources = {
  consult_crm: { label: 'CRM e Prospecção', path: '/crm' },
  consult_clients: { label: 'Clientes', path: '/clients' },
  consult_contracts: { label: 'Contratos', path: '/contracts' },
  consult_finance: { label: 'Financeiro', path: '/finance/management' },
  consult_proposals: { label: 'Simulador', path: '/finance/simulator' },
  consult_goals: { label: 'Metas', path: '/goals' },
};
@Injectable()
export class AiToolsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crm: ProspectingService,
    private readonly clients: ClientsService,
    private readonly contracts: ContractsService,
    private readonly finance: ManagementService,
    private readonly proposals: SimulatorService,
    private readonly goals: GoalsService,
  ) {}
  async authorize(actor: AiActor) {
    const current = await this.db.adminProfile.findUnique({
      where: { id: actor.id },
      select: { active: true, role: true, recoveryRequired: true },
    });
    if (!current?.active || current.recoveryRequired || current.role !== actor.role)
      throw new ForbiddenException('Sessão ou permissões alteradas. Recarregue a página.');
  }
  async execute(name: string, args: unknown, actor: AiActor): Promise<unknown> {
    if (!Object.hasOwn(schemas, name) || (name === 'consult_finance' && actor.role !== 'OWNER'))
      throw new ForbiddenException(
        'Ferramenta não autorizada. Somente consultas previamente definidas são permitidas.',
      );
    await this.authorize(actor);
    const parsed = schemas[name as keyof typeof schemas].safeParse(args ?? {});
    if (!parsed.success) throw new BadRequestException('Parâmetros de consulta inválidos.');
    // No dynamic method lookup, URLs, SQL or write-capable tool is exposed to Gemini.
    switch (name) {
      case 'consult_crm': {
        const q = schemas.consult_crm.parse(args ?? {}),
          r = await this.crm.list({
            ...q,
            page: Math.floor((q.page - 1) / 3) + 1,
            ...(actor.role === 'ADMIN' ? { assigneeId: actor.id } : {}),
          });
        return paging(
          r.items.map((l) => ({
            id: l.id,
            companyName: cut(l.companyName),
            segment: l.segment,
            status: l.status,
            city: cut(l.city),
            nextAction: cut(l.nextAction, 500),
            lastContactAt: l.lastContactAt,
            updatedAt: l.updatedAt,
          })),
          r.total,
          q.page,
        );
      }
      case 'consult_clients': {
        const q = schemas.consult_clients.parse(args ?? {}),
          r = await this.clients.list(
            { ...q, days: 30, page: Math.floor((q.page - 1) / 3) + 1 },
            actor.id,
            actor.role,
          );
        return paging(
          r.items.map((c) => ({
            id: c.id,
            companyName: cut(c.companyName),
            segment: c.segment,
            status: c.status,
            city: cut(c.city),
            responsibleId: c.responsibleId,
            updatedAt: c.updatedAt,
          })),
          r.total,
          q.page,
        );
      }
      case 'consult_contracts': {
        const q = schemas.consult_contracts.parse(args ?? {});
        const r = q.id
          ? { items: [await this.contracts.get(q.id, actor.id, actor.role)], total: 1 }
          : await this.contracts.list(
              {
                page: Math.floor((q.page - 1) / 3) + 1,
                days: 30,
                status: q.status,
                expiresIn: q.period,
              },
              actor.id,
              actor.role,
            );
        const view = paging(
          r.items.map((c) => ({
            id: c.id,
            number: cut(c.number),
            title: cut(c.title),
            client: c.client.companyName,
            status: c.effectiveStatus,
            startsOn: c.startsOn,
            endsOn: c.endsOn,
            services: c.services.map((s) => s.code),
            ...(actor.role === 'OWNER'
              ? {
                  monthlyCents: 'currentMonthlyCents' in c ? c.currentMonthlyCents : null,
                  setupCents: 'setupCents' in c ? c.setupCents : null,
                }
              : {}),
          })),
          r.total,
          q.id ? 1 : q.page,
        );
        return {
          ...view,
          ...(q.period
            ? {
                items: view.items.filter((c) => c.endsOn?.toISOString().slice(0, 7) === q.period),
                period: q.period,
              }
            : {}),
        };
      }
      case 'consult_finance': {
        if (actor.role !== 'OWNER') throw new ForbiddenException();
        const q = schemas.consult_finance.parse(args ?? {}),
          r = await this.finance.summary({ period: q.period ?? today().slice(0, 7), page: 1 });
        return {
          period: r.period,
          currency: 'BRL',
          receivedCents: r.receivedCents,
          paidCents: r.paidCents,
          balanceCents: r.balanceCents,
          pendingIncomeCents: r.pendingIncomeCents,
          pendingExpenseCents: r.pendingExpenseCents,
          forecastCents: r.forecastCents,
          note: 'Somente recebido/pago é caixa realizado. Previsto e pendente não são pagamentos.',
        };
      }
      case 'consult_proposals': {
        const q = schemas.consult_proposals.parse(args ?? {});
        const rows = q.id
          ? [await this.proposals.get(q.id)]
          : await this.proposals.list(
              Math.floor((q.page - 1) / 3) + 1,
              actor.role === 'ADMIN' ? actor.id : undefined,
            );
        const allowed = rows.filter((p) => actor.role === 'OWNER' || p.responsibleId === actor.id);
        if (q.id && !allowed.length) throw new ForbiddenException('Proposta não autorizada.');
        const view = paging(
          allowed.map((p) => {
            const result = p.result as Record<string, unknown>,
              input = p.input as Record<string, unknown>;
            return {
              id: p.id,
              companyName: cut(p.companyName),
              status: p.status,
              version: p.version,
              monthlyCents: result.monthlyCents,
              setupCents: input.setupCents,
              savingsCents: result.savingsCents,
              annualSavingsCents: result.annualSavingsCents,
              discountBps: result.discountBps,
              unpriced: result.unpriced,
              overlap: result.overlap,
              note: 'Simulação comercial; não representa contrato ou receita recebida.',
            };
          }),
          q.id ? allowed.length : undefined,
          q.id ? 1 : q.page,
        );
        if (!q.id && rows.length === 30 && ((q.page - 1) % 3) * 10 + 10 >= allowed.length) {
          return { ...view, hasMore: true, nextPage: Math.ceil(q.page / 3) * 3 + 1, partial: true };
        }
        return view;
      }
      case 'consult_goals': {
        const q = schemas.consult_goals.parse(args ?? {});
        if (actor.role !== 'OWNER' && q.category === 'FINANCIAL')
          throw new ForbiddenException('Metas financeiras são privadas.');
        const r = await this.goals.list(
          { ...q, page: Math.floor((q.page - 1) / 3) + 1 },
          actor.id,
          actor.role,
        );
        return paging(
          r.items.map((g) => ({
            id: g.id,
            title: cut(g.title),
            metric: g.metric,
            mode: g.mode,
            status: g.progress.status,
            target: g.target,
            value: g.progress.value,
            unit: g.unit,
            percent: g.progress.percent,
            endsOn: g.endsOn,
            reason: cut(g.progress.reason, 400),
            source: cut(g.progress.source, 500),
          })),
          r.total,
          q.page,
        );
      }
    }
    throw new ForbiddenException('Ferramenta não autorizada.');
  }
}
