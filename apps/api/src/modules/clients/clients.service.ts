import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { Prisma, ClientStatus } from '../../generated/prisma/client.js';
import { actorActive, expected } from '../finance/finance-support.js';
import { clientAccess, cnpjValue, commercialLock, owner } from './commercial-support.js';
import type {
  ClientDto,
  UpdateClientDto,
  CommercialFiltersDto,
  ClientStateDto,
  ConvertLeadDto,
  ContactDto,
  ClientServiceDto,
} from './commercial.dto.js';
const responsible = { select: { id: true, email: true } } as const;
export const clientTransitions: Record<ClientStatus, ClientStatus[]> = {
  PROSPECT: ['ONBOARDING', 'INACTIVE'],
  ONBOARDING: ['ACTIVE', 'SUSPENDED', 'INACTIVE'],
  ACTIVE: ['SUSPENDED', 'INACTIVE'],
  SUSPENDED: ['ONBOARDING', 'ACTIVE', 'INACTIVE'],
  INACTIVE: ['PROSPECT', 'ONBOARDING'],
};
@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}
  async require(id: string, actor: string, role: string, tx: Prisma.TransactionClient = this.db) {
    const row = await clientAccess(tx, id, actor, role);
    if (!row) throw new NotFoundException('Cliente não encontrado.');
    return row;
  }
  async list(q: CommercialFiltersDto, actor: string, role: string) {
    if (q.status && !Object.keys(clientTransitions).includes(q.status))
      throw new BadRequestException('Status de cliente inválido.');
    const where: Prisma.ClientWhereInput = {
      status: q.status as ClientStatus | undefined,
      segment: q.segment,
      responsibleId: role === 'OWNER' ? q.responsibleId : actor,
      OR: q.query
        ? [
            { companyName: { contains: q.query, mode: 'insensitive' } },
            { tradeName: { contains: q.query, mode: 'insensitive' } },
            { cnpj: q.query.replace(/[./-]/g, '').trim().toUpperCase() },
          ]
        : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.client.findMany({
        where,
        include: { responsible },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 30,
        skip: (q.page - 1) * 30,
      }),
      this.db.client.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: 30 };
  }
  async get(id: string, actor: string, role: string) {
    await this.require(id, actor, role);
    const client = await this.db.client.findUniqueOrThrow({
      where: { id },
      include: {
        responsible,
        contacts: { orderBy: [{ primary: 'desc' }, { name: 'asc' }] },
        services: true,
        leads: { select: { id: true, companyName: true, status: true } },
      },
    });
    return client;
  }
  async activity(id: string, actor: string, role: string, q: CommercialFiltersDto) {
    await this.require(id, actor, role);
    return this.db.clientActivity.findMany({
      where: { clientId: id },
      include: { actor: responsible },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * 30,
      take: 30,
    });
  }
  async record(
    tx: Prisma.TransactionClient,
    id: string,
    actor: string,
    kind: string,
    body: string,
  ) {
    await tx.clientActivity.create({ data: { clientId: id, actorId: actor, kind, body } });
    await tx.adminAuditEvent.create({ data: { actorId: actor, action: kind, targetId: id } });
  }
  private data(dto: Partial<ClientDto>) {
    const { cnpj, postalCode, ...data } = dto;
    return {
      ...data,
      ...(cnpj !== undefined ? { cnpj: cnpjValue(cnpj) } : {}),
      ...(postalCode !== undefined ? { postalCode: postalCode.replace(/\D/g, '') } : {}),
    };
  }
  async create(dto: ClientDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      if (role !== 'OWNER' && dto.responsibleId !== actor)
        throw new BadRequestException('ADMIN deve assumir o cadastro que criou.');
      await actorActive(tx, dto.responsibleId);
      const cnpj = cnpjValue(dto.cnpj);
      if (cnpj && (await tx.client.findUnique({ where: { cnpj } })))
        throw new ConflictException('CNPJ já cadastrado.');
      const row = await tx.client.create({
        data: {
          ...this.data(dto),
          companyName: dto.companyName.trim(),
          segment: dto.segment,
          responsibleId: dto.responsibleId,
        },
      });
      await this.record(
        tx,
        row.id,
        actor,
        'CLIENT_CREATED',
        'Cliente cadastrado como potencial cliente.',
      );
      return row;
    });
  }
  async update(id: string, dto: UpdateClientDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      if (dto.responsibleId) {
        if (role !== 'OWNER' && dto.responsibleId !== actor)
          throw new BadRequestException('Somente OWNER pode transferir o responsável.');
        await actorActive(tx, dto.responsibleId);
      }
      const { version, ...input } = dto;
      const data = this.data(input);
      if (data.cnpj && (await tx.client.findFirst({ where: { cnpj: data.cnpj, id: { not: id } } })))
        throw new ConflictException('CNPJ já cadastrado.');
      const after = await tx.client.update({
        where: { id },
        data: { ...data, version: version + 1 },
      });
      const changed = Object.keys(data).filter(
        (k) =>
          JSON.stringify(before[k as keyof typeof before]) !==
          JSON.stringify(after[k as keyof typeof after]),
      );
      await this.record(
        tx,
        id,
        actor,
        'CLIENT_UPDATED',
        'Campos atualizados: ' + (changed.join(', ') || 'sem alterações') + '.',
      );
      return after;
    });
  }
  async state(id: string, dto: ClientStateDto, actor: string, role: string) {
    owner(role);
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      if (!clientTransitions[before.status].includes(dto.status))
        throw new BadRequestException('Transição de relacionamento não permitida.');
      const row = await tx.client.update({
        where: { id },
        data: { status: dto.status, version: { increment: 1 } },
      });
      await this.record(
        tx,
        id,
        actor,
        'CLIENT_STATUS_CHANGED',
        `${before.status} → ${dto.status}: ${dto.reason}`,
      );
      return row;
    });
  }
  async note(id: string, body: string, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      await this.require(id, actor, role, tx);
      await this.record(tx, id, actor, 'CLIENT_INTERACTION', body);
      return { saved: true };
    });
  }
  async contact(id: string, dto: ContactDto, actor: string, role: string, contactId?: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      await this.require(id, actor, role, tx);
      const old = contactId
        ? await tx.clientContact.findFirst({ where: { id: contactId, clientId: id } })
        : null;
      if (contactId && !old) throw new NotFoundException('Contato não encontrado.');
      if (old) expected(old, dto.version);
      if (dto.primary)
        await tx.clientContact.updateMany({
          where: { clientId: id, primary: true, id: contactId ? { not: contactId } : undefined },
          data: { primary: false, version: { increment: 1 } },
        });
      const { version, ...data } = dto;
      void version;
      const row = old
        ? await tx.clientContact.update({
            where: { id: contactId },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.clientContact.create({ data: { ...data, clientId: id } });
      await this.record(
        tx,
        id,
        actor,
        'CLIENT_CONTACT_SAVED',
        old ? 'Contato empresarial atualizado.' : 'Contato empresarial cadastrado.',
      );
      return row;
    });
  }
  async service(id: string, dto: ClientServiceDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      const { version, ...data } = dto;
      void version;
      const row = await tx.clientService.upsert({
        where: { clientId_code: { clientId: id, code: dto.code } },
        create: { ...data, clientId: id },
        update: data,
      });
      await tx.client.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.record(tx, id, actor, 'CLIENT_SERVICE_CHANGED', `${dto.code}: ${dto.status}`);
      return row;
    });
  }
  async convert(leadId: string, dto: ConvertLeadDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      await tx.$queryRaw`SELECT id FROM vympa_private.leads WHERE id=${leadId}::uuid FOR UPDATE`;
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new NotFoundException('Lead não encontrado.');
      if (role !== 'OWNER' && lead.assigneeId !== actor && lead.createdById !== actor)
        throw new BadRequestException('Lead não atribuído a este administrador.');
      if (lead.clientId) {
        await this.require(lead.clientId, actor, role, tx);
        if (dto.clientId && dto.clientId !== lead.clientId)
          throw new ConflictException('Lead já convertido para outro cliente.');
        return tx.client.findUniqueOrThrow({ where: { id: lead.clientId } });
      }
      const cnpj = cnpjValue(dto.cnpj);
      let client = dto.clientId
        ? await this.require(dto.clientId, actor, role, tx)
        : cnpj
          ? await tx.client.findUnique({ where: { cnpj } })
          : null;
      if (client) {
        await this.require(client.id, actor, role, tx);
        if (cnpj && client.cnpj !== cnpj)
          throw new ConflictException('CNPJ não corresponde ao cliente selecionado.');
      }
      if (!client) {
        const name = (dto.companyName || lead.companyName)?.trim();
        if (!name || name.length < 2)
          throw new BadRequestException(
            'Informe o nome empresarial ou selecione um cliente existente.',
          );
        const responsibleId = dto.responsibleId || lead.assigneeId || actor;
        if (role !== 'OWNER' && responsibleId !== actor)
          throw new BadRequestException('ADMIN deve assumir o cliente convertido.');
        await actorActive(tx, responsibleId);
        client = await tx.client.create({
          data: {
            companyName: name,
            cnpj,
            segment: lead.segment,
            email: lead.email,
            city: lead.city,
            state: lead.state,
            responsibleId,
          },
        });
      }
      await tx.lead.update({ where: { id: leadId }, data: { clientId: client.id } });
      await tx.leadEvent.create({
        data: {
          leadId,
          actorId: actor,
          kind: 'CLIENT_LINKED',
          body: 'Cliente vinculado: ' + client.id,
        },
      });
      await this.record(
        tx,
        client.id,
        actor,
        'LEAD_CONVERTED',
        'Lead vinculado: ' + leadId + '. Notas e interações preservadas no CRM.',
      );
      return client;
    });
  }
}
