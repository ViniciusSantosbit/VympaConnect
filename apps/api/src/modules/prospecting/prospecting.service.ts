import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateLeadDto,
  UpdateLeadDto,
  LeadFiltersDto,
  LeadStatusDto,
  NoteDto,
  InteractionDto,
  FollowUpDto,
} from './prospecting.dto.js';

const include = {
  externalReference: true,
  assignee: { select: { id: true, email: true } },
} as const;
@Injectable()
export class ProspectingService {
  constructor(private readonly db: DatabaseService) {}
  references(placeIds: string[]) {
    return this.db.placeReference.findMany({
      where: { placeId: { in: placeIds } },
      select: { placeId: true, lead: { select: { id: true, status: true, assigneeId: true } } },
    });
  }
  assignees() {
    return this.db.adminProfile.findMany({
      where: { active: true },
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
      take: 100,
    });
  }
  async list(filters: LeadFiltersDto) {
    const where: Prisma.LeadWhereInput = {
      segment: filters.segment,
      status: filters.status,
      assigneeId: filters.assigneeId,
      state: filters.state,
      region: filters.region,
      city: filters.city ? { contains: filters.city, mode: 'insensitive' } : undefined,
      OR: filters.query
        ? [
            { companyName: { contains: filters.query, mode: 'insensitive' } },
            { externalReference: { placeId: filters.query } },
          ]
        : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.lead.findMany({
        where,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 30,
        skip: ((filters.page ?? 1) - 1) * 30,
      }),
      this.db.lead.count({ where }),
    ]);
    return { items, total, page: filters.page ?? 1, pageSize: 30 };
  }
  async get(id: string) {
    const lead = await this.db.lead.findUnique({
      where: { id },
      include: {
        ...include,
        events: {
          include: { actor: { select: { email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        followUps: { orderBy: { dueAt: 'asc' }, take: 100 },
      },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return lead;
  }
  private async assignee(tx: Prisma.TransactionClient, id: string | null | undefined) {
    if (id && !(await tx.adminProfile.findFirst({ where: { id, active: true } })))
      throw new BadRequestException('Responsável deve ser administrador ativo.');
  }
  async create(dto: CreateLeadDto, actorId: string) {
    if (!dto.placeId && !dto.companyName?.trim())
      throw new BadRequestException('Informe um Place ID ou nome próprio da empresa.');
    const { placeId, ...data } = dto;
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assignee(tx, dto.assigneeId);
        const lead = await tx.lead.create({
          data: {
            ...data,
            createdById: actorId,
            externalReference: placeId ? { create: { placeId } } : undefined,
            events: { create: { actorId, kind: 'CREATED', body: 'Lead adicionado à prospecção.' } },
          },
          include,
        });
        await tx.adminAuditEvent.create({
          data: { actorId, action: 'LEAD_CREATED', targetId: lead.id },
        });
        return lead;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Este Place ID já está no CRM.');
      throw error;
    }
  }
  private async mutate(
    id: string,
    actorId: string,
    action: string,
    change: (
      tx: Prisma.TransactionClient,
      lead: Awaited<ReturnType<Prisma.TransactionClient['lead']['findUniqueOrThrow']>>,
    ) => Promise<void>,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vympa_private.leads WHERE id = ${id}::uuid FOR UPDATE`;
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundException('Lead não encontrado.');
      await change(tx, lead);
      await tx.adminAuditEvent.create({ data: { actorId, action, targetId: id } });
    });
    return this.get(id);
  }
  update(id: string, dto: UpdateLeadDto, actorId: string) {
    return this.mutate(id, actorId, 'LEAD_UPDATED', async (tx) => {
      await this.assignee(tx, dto.assigneeId);
      await tx.lead.update({ where: { id }, data: dto });
      await tx.leadEvent.create({
        data: {
          leadId: id,
          actorId,
          kind: 'UPDATED',
          body:
            dto.assigneeId !== undefined
              ? 'Responsável atualizado.'
              : 'Dados comerciais próprios atualizados.',
        },
      });
    });
  }
  status(id: string, dto: LeadStatusDto, actorId: string) {
    if (dto.status === 'LOST' && !dto.lossReason?.trim())
      throw new BadRequestException('Informe o motivo da perda.');
    return this.mutate(id, actorId, 'LEAD_STATUS_CHANGED', async (tx, lead) => {
      if (lead.status === dto.status) return;
      await tx.lead.update({
        where: { id },
        data: { status: dto.status, lossReason: dto.status === 'LOST' ? dto.lossReason : null },
      });
      await tx.leadEvent.create({
        data: {
          leadId: id,
          actorId,
          kind: 'STATUS',
          previousStatus: lead.status,
          newStatus: dto.status,
          body: dto.observation || dto.lossReason || null,
        },
      });
    });
  }
  event(id: string, dto: NoteDto | InteractionDto, actorId: string, kind: 'NOTE' | 'INTERACTION') {
    if (!dto.body.trim()) throw new BadRequestException('Texto obrigatório.');
    return this.mutate(
      id,
      actorId,
      kind === 'NOTE' ? 'LEAD_NOTE_ADDED' : 'LEAD_INTERACTION_ADDED',
      async (tx) => {
        await tx.leadEvent.create({
          data: {
            leadId: id,
            actorId,
            kind,
            body: dto.body,
            channel: 'channel' in dto ? dto.channel : null,
          },
        });
        await tx.lead.update({
          where: { id },
          data: kind === 'INTERACTION' ? { lastContactAt: new Date() } : { updatedAt: new Date() },
        });
      },
    );
  }
  followUp(id: string, dto: FollowUpDto, actorId: string) {
    if (new Date(dto.dueAt) <= new Date())
      throw new BadRequestException('Acompanhamento deve ter data futura.');
    return this.mutate(id, actorId, 'LEAD_FOLLOW_UP_ADDED', async (tx) => {
      await tx.leadFollowUp.create({ data: { leadId: id, ...dto, dueAt: new Date(dto.dueAt) } });
      await tx.lead.update({ where: { id }, data: { nextAction: dto.action } });
      await tx.leadEvent.create({
        data: { leadId: id, actorId, kind: 'FOLLOW_UP', body: dto.action },
      });
    });
  }
  completeFollowUp(id: string, followUpId: string, actorId: string) {
    return this.mutate(id, actorId, 'LEAD_FOLLOW_UP_COMPLETED', async (tx) => {
      const changed = await tx.leadFollowUp.updateMany({
        where: { id: followUpId, leadId: id, completedAt: null },
        data: { completedAt: new Date() },
      });
      if (!changed.count) throw new NotFoundException('Acompanhamento pendente não encontrado.');
      await tx.leadEvent.create({
        data: { leadId: id, actorId, kind: 'FOLLOW_UP_DONE', body: 'Acompanhamento concluído.' },
      });
    });
  }
}
