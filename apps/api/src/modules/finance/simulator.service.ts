import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { calculateSimulation, discountFor, provisionalRules } from '@vympa/shared';
import type { DiscountPoint } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  OfferingDto,
  PolicyDto,
  SimulationDto,
  ProposalDto,
  ProposalStateDto,
} from './finance.dto.js';
import { actorActive, audit, date, expected, json, lock } from './finance-support.js';
@Injectable()
export class SimulatorService {
  constructor(private readonly db: DatabaseService) {}
  catalog() {
    return this.db.serviceOffering.findMany({
      orderBy: { code: 'asc' },
      include: { priceHistory: { orderBy: { version: 'desc' }, take: 10 } },
    });
  }
  async policy(tx: Prisma.TransactionClient = this.db) {
    return (
      (await tx.discountPolicy.findUnique({ where: { id: 'default' } })) ?? {
        id: 'default',
        rules: provisionalRules,
        provisional: true,
        version: 0,
      }
    );
  }
  async saveOffering(code: string, dto: OfferingDto, actor: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(723112)`;
      const before = await tx.serviceOffering.findUnique({ where: { code } });
      if (!before) throw new NotFoundException('Serviço não encontrado.');
      expected(before, dto.version);
      const { version, ...data } = dto;
      const after = await tx.serviceOffering.update({
        where: { code },
        data: { ...data, version: version + 1 },
      });
      await tx.servicePriceVersion.create({
        data: { offeringId: after.id, version: after.version, snapshot: json(after) },
      });
      await audit(tx, actor, 'SERVICE_PRICE_CHANGED', after.id, before, after);
      return after;
    });
  }
  async savePolicy(dto: PolicyDto, actor: string) {
    try {
      discountFor(0, dto.rules);
    } catch {
      throw new BadRequestException(
        'Faixas devem iniciar em zero, ser ordenadas e usar percentuais válidos.',
      );
    }
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(723112)`;
      const before = await tx.discountPolicy.findUnique({ where: { id: 'default' } });
      expected(before, dto.version);
      const data = {
        rules: json(dto.rules),
        provisional: dto.provisional,
        version: dto.version + 1,
      };
      const after = await tx.discountPolicy.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...data },
        update: data,
      });
      await audit(tx, actor, 'DISCOUNT_POLICY_CHANGED', 'default', before, after);
      return after;
    });
  }
  async calculate(dto: SimulationDto, role: string, tx: Prisma.TransactionClient = this.db) {
    const manual = dto.manualDiscountBps !== undefined || dto.manualMonthlyCents !== undefined;
    if (manual && role !== 'OWNER')
      throw new ForbiddenException('Somente OWNER pode negociar exceções manuais.');
    if (dto.manualDiscountBps !== undefined && dto.manualMonthlyCents !== undefined)
      throw new BadRequestException('Informe uma única exceção: percentual ou mensalidade.');
    if (manual && (dto.exceptionReason?.trim().length ?? 0) < 5)
      throw new BadRequestException('Justifique a exceção comercial.');
    const policy = await this.policy(tx);
    const offerings = await tx.serviceOffering.findMany({
      where: { code: { in: dto.offeringCodes } },
    });
    if (offerings.length !== dto.offeringCodes.length || offerings.some((o) => !o.active))
      throw new BadRequestException('Selecione somente serviços ativos do catálogo.');
    const result = calculateSimulation(dto, policy.rules as unknown as DiscountPoint[]);
    const catalogueTotalCents =
      !result.overlap && offerings.every((o) => o.monthlyCents !== null)
        ? offerings.reduce((sum, o) => sum + o.monthlyCents!, 0)
        : null;
    return {
      ...result,
      catalogueTotalCents,
      unpriced: offerings.some((o) => o.monthlyCents === null),
      policySnapshot: json(policy),
      offeringSnapshots: json(offerings),
      currency: 'BRL',
      months: 12,
      manualException: manual,
    };
  }
  list(page = 1) {
    return this.db.proposal.findMany({
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * 30,
      take: 30,
      include: { responsible: { select: { id: true, email: true } } },
    });
  }
  async get(id: string) {
    const p = await this.db.proposal.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: 'desc' } },
        responsible: { select: { id: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Simulação não encontrada.');
    return p;
  }
  async save(dto: ProposalDto, actor: string, role: string, id?: string) {
    return this.db.$transaction(async (tx) => {
      if (id) await lock(tx, 'proposals', id);
      const before = id ? await tx.proposal.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Simulação não encontrada.');
      if (before) {
        expected(before, dto.version);
        if (before.status !== 'DRAFT')
          throw new BadRequestException(
            'Somente rascunhos podem ser editados. Duplique para uma nova negociação.',
          );
      }
      await actorActive(tx, dto.responsibleId);
      if (dto.leadId && !(await tx.lead.findUnique({ where: { id: dto.leadId } })))
        throw new BadRequestException('Lead não encontrado.');
      const result = await this.calculate(dto, role, tx);
      const version = (before?.version ?? 0) + 1;
      const data = {
        companyName: dto.companyName.trim(),
        segment: dto.segment,
        leadId: dto.leadId || null,
        responsibleId: dto.responsibleId,
        simulationDate: date(dto.simulationDate),
        input: json(dto),
        result: json(result),
        version,
      };
      const after = before
        ? await tx.proposal.update({ where: { id }, data })
        : await tx.proposal.create({ data: { ...data, createdById: actor } });
      await tx.proposalVersion.create({
        data: { proposalId: after.id, version, snapshot: json(after) },
      });
      await audit(
        tx,
        actor,
        before ? 'PROPOSAL_DRAFT_UPDATED' : 'PROPOSAL_CREATED',
        after.id,
        before,
        after,
      );
      return after;
    });
  }
  async duplicate(id: string, actor: string, role: string) {
    const previous = await this.get(id);
    const input = previous.input as unknown as ProposalDto;
    return this.save({ ...input, version: undefined }, actor, role);
  }
  async state(id: string, dto: ProposalStateDto, actor: string) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'proposals', id);
      const before = await tx.proposal.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Simulação não encontrada.');
      expected(before, dto.version);
      const transitions: Record<string, string[]> = {
        DRAFT: ['PREPARED'],
        PREPARED: ['SENT', 'EXPIRED'],
        SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
      };
      if (!transitions[before.status]?.includes(dto.status))
        throw new BadRequestException('Transição de proposta não permitida.');
      const result = before.result as unknown as { unpriced: boolean; overlap: boolean };
      const input = before.input as unknown as ProposalDto;
      if (
        dto.status === 'PREPARED' &&
        (result.unpriced || (result.overlap && !input.bundleScope?.trim()))
      )
        throw new BadRequestException(
          'Defina os preços dos serviços e esclareça o escopo de serviços sobrepostos antes de preparar.',
        );
      const after = await tx.proposal.update({
        where: { id },
        data: { status: dto.status, version: before.version + 1 },
      });
      await tx.proposalVersion.create({
        data: { proposalId: id, version: after.version, snapshot: json(after) },
      });
      await audit(tx, actor, 'PROPOSAL_STATUS_CHANGED', id, before, after);
      return after;
    });
  }
}
