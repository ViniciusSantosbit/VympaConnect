import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { Prisma, type ContractStatus } from '../../generated/prisma/client.js';
import { actorActive, expected, json } from '../finance/finance-support.js';
import { ClientsService } from '../clients/clients.service.js';
import {
  commercialLock,
  contractPublic,
  effectiveMonthly,
  owner,
  today,
  validDate,
} from '../clients/commercial-support.js';
import type {
  ContractDto,
  UpdateContractDto,
  CommercialFiltersDto,
  ContractStateDto,
  AmendmentDto,
  RenewalDto,
} from '../clients/commercial.dto.js';
const include = {
  client: { select: { id: true, companyName: true, responsibleId: true } },
  responsible: { select: { id: true, email: true } },
  services: true,
  amendments: { orderBy: { effectiveOn: 'asc' } as const },
} as const;
export const contractTransitions: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ['PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['DRAFT', 'SIGNED', 'CANCELLED'],
  SIGNED: ['ACTIVE', 'TERMINATED'],
  ACTIVE: ['EXPIRED', 'TERMINATED'],
  EXPIRED: [],
  TERMINATED: [],
  CANCELLED: [],
};
@Injectable()
export class ContractsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly clients: ClientsService,
  ) {}
  async require(id: string, actor: string, role: string, tx: Prisma.TransactionClient = this.db) {
    const row = await tx.contract.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Contrato não encontrado.');
    if (role !== 'OWNER' && row.responsibleId !== actor && row.client.responsibleId !== actor)
      throw new ForbiddenException('Contrato não autorizado.');
    return row;
  }
  async record(
    tx: Prisma.TransactionClient,
    id: string,
    actor: string,
    kind: string,
    reason: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.contractStatusHistory.create({
      data: {
        contractId: id,
        actorId: actor,
        kind,
        reason,
        before: before == null ? Prisma.DbNull : json(before),
        after: json(after),
      },
    });
    await tx.adminAuditEvent.create({ data: { actorId: actor, action: kind, targetId: id } });
  }
  private where(q: CommercialFiltersDto, actor: string, role: string): Prisma.ContractWhereInput {
    if (q.status && !Object.keys(contractTransitions).includes(q.status))
      throw new BadRequestException('Status contratual inválido.');
    return {
      ...(q.status === 'EXPIRED'
        ? {
            OR: [
              { status: 'EXPIRED' as const },
              { status: 'ACTIVE' as const, endsOn: { lt: validDate(today()) } },
            ],
          }
        : {
            status: q.status as ContractStatus | undefined,
            ...(q.status === 'ACTIVE'
              ? { OR: [{ endsOn: null }, { endsOn: { gte: validDate(today()) } }] }
              : {}),
          }),
      clientId: q.clientId,
      ...(q.expiresIn
        ? {
            endsOn: {
              gte: validDate(q.expiresIn + '-01'),
              lt: new Date(
                Date.UTC(Number(q.expiresIn.slice(0, 4)), Number(q.expiresIn.slice(5, 7)), 1),
              ),
            },
          }
        : {}),
      client: q.segment ? { segment: q.segment } : undefined,
      AND: [
        ...(role === 'OWNER'
          ? []
          : [{ OR: [{ responsibleId: actor }, { client: { responsibleId: actor } }] }]),
        ...(q.query
          ? [
              {
                OR: [
                  { title: { contains: q.query, mode: 'insensitive' as const } },
                  { number: { contains: q.query, mode: 'insensitive' as const } },
                  { client: { companyName: { contains: q.query, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };
  }
  public(row: Awaited<ReturnType<ContractsService['require']>>, role: string) {
    const currentMonthlyCents = effectiveMonthly(row);
    const effectiveStatus =
      row.status === 'ACTIVE' && row.endsOn && row.endsOn < validDate(today())
        ? 'EXPIRED'
        : row.status;
    return {
      ...contractPublic(row, role),
      ...(role === 'OWNER' ? { currentMonthlyCents } : {}),
      effectiveStatus,
    };
  }
  async list(q: CommercialFiltersDto, actor: string, role: string) {
    const where = this.where(q, actor, role);
    const [items, total] = await this.db.$transaction([
      this.db.contract.findMany({
        where,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 30,
        skip: (q.page - 1) * 30,
      }),
      this.db.contract.count({ where }),
    ]);
    return { items: items.map((r) => this.public(r, role)), total, page: q.page, pageSize: 30 };
  }
  async get(id: string, actor: string, role: string) {
    const row = await this.require(id, actor, role);
    const history = await this.db.contractStatusHistory.findMany({
      where: { contractId: id },
      include: { actor: { select: { email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return {
      ...this.public(row, role),
      history:
        role === 'OWNER'
          ? history
          : history.map(({ id, kind, createdAt, actor }) => ({ id, kind, createdAt, actor })),
    };
  }
  async expiring(q: CommercialFiltersDto, actor: string, role: string) {
    const start = validDate(today()),
      end = new Date(start);
    end.setUTCDate(end.getUTCDate() + q.days);
    const rows = await this.db.contract.findMany({
      where: {
        AND: [
          this.where({ ...q, status: undefined }, actor, role),
          { status: { in: ['SIGNED', 'ACTIVE'] }, endsOn: { gte: start, lte: end } },
        ],
      },
      include,
      orderBy: { endsOn: 'asc' },
      take: 30,
      skip: (q.page - 1) * 30,
    });
    return rows.map((r) => this.public(r, role));
  }
  async summary(actor: string, role: string) {
    const where = this.where({ page: 1, days: 30 }, actor, role),
      start = validDate(today()),
      end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 30);
    const [
      totalClients,
      activeClients,
      onboarding,
      active,
      expired,
      pendingSignature,
      expiring,
      renewals,
      rows,
    ] = await Promise.all([
      this.db.client.count({ where: role === 'OWNER' ? {} : { responsibleId: actor } }),
      this.db.client.count({
        where: { status: 'ACTIVE', ...(role === 'OWNER' ? {} : { responsibleId: actor }) },
      }),
      this.db.client.count({
        where: { status: 'ONBOARDING', ...(role === 'OWNER' ? {} : { responsibleId: actor }) },
      }),
      this.db.contract.count({
        where: {
          AND: [
            where,
            {
              status: 'ACTIVE',
              startsOn: { lte: start },
              OR: [{ endsOn: null }, { endsOn: { gte: start } }],
            },
          ],
        },
      }),
      this.db.contract.count({
        where: {
          AND: [
            where,
            { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endsOn: { lt: start } }] },
          ],
        },
      }),
      this.db.contract.count({ where: { AND: [where, { status: 'PENDING_SIGNATURE' }] } }),
      this.db.contract.count({
        where: {
          AND: [where, { status: { in: ['ACTIVE', 'SIGNED'] }, endsOn: { gte: start, lte: end } }],
        },
      }),
      this.db.contract.count({
        where: { AND: [where, { renewedFromId: { not: null }, status: 'DRAFT' }] },
      }),
      role === 'OWNER'
        ? this.db.contract.findMany({
            where: {
              status: 'ACTIVE',
              billingPeriod: { in: ['MONTHLY', 'QUARTERLY', 'YEARLY'] },
              startsOn: { lte: start },
              OR: [{ endsOn: null }, { endsOn: { gte: start } }],
            },
            include: { amendments: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      totalClients,
      activeClients,
      onboarding,
      active,
      expired,
      pendingSignature,
      expiring,
      renewals,
      monthlyContractedCents:
        role === 'OWNER'
          ? rows.reduce((sum, r) => sum + BigInt(effectiveMonthly(r) ?? 0), 0n).toString()
          : null,
      unpriced: role === 'OWNER' ? rows.filter((r) => effectiveMonthly(r) === null).length : null,
    };
  }
  private dates(starts?: string | null, ends?: string | null) {
    const a = starts ? validDate(starts) : null,
      b = ends ? validDate(ends) : null;
    if (a && b && b < a) throw new BadRequestException('Término anterior ao início da vigência.');
    return { startsOn: a, endsOn: b };
  }
  async create(dto: ContractDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const existing = await tx.contract.findUnique({
        where: { requestKey: dto.requestKey },
        include,
      });
      if (existing) {
        await this.require(existing.id, actor, role, tx);
        if (existing.clientId !== dto.clientId || existing.number !== dto.number)
          throw new ConflictException('Chave já utilizada em outro rascunho.');
        for (const field of [
          'title',
          'responsibleId',
          'description',
          'monthlyCents',
          'setupCents',
          'billingPeriod',
          'commercialTerms',
          'adjustmentTerms',
          'notes',
          'proposalId',
        ] as const) {
          if (dto[field] !== undefined && dto[field] !== existing[field])
            throw new ConflictException('Chave de envio reutilizada com condições diferentes.');
        }
        return this.public(existing, role);
      }
      await this.clients.require(dto.clientId, actor, role, tx);
      await actorActive(tx, dto.responsibleId);
      if (
        role !== 'OWNER' &&
        (dto.monthlyCents !== undefined ||
          dto.setupCents !== undefined ||
          dto.commercialTerms !== undefined ||
          dto.adjustmentTerms !== undefined ||
          dto.proposalId)
      )
        owner(role);
      if (role !== 'OWNER' && dto.responsibleId !== actor)
        throw new ForbiddenException('ADMIN deve assumir o rascunho.');
      if (await tx.contract.findUnique({ where: { number: dto.number } }))
        throw new ConflictException('Número contratual já utilizado.');
      const { serviceCodes, startsOn, endsOn, proposalId, ...data } = dto;
      let snapshot: Prisma.InputJsonValue | undefined,
        monthlyCents = dto.monthlyCents,
        setupCents = dto.setupCents,
        codes = serviceCodes ?? [];
      if (proposalId) {
        await tx.$queryRaw`SELECT id FROM vympa_private.proposals WHERE id=${proposalId}::uuid FOR UPDATE`;
        const proposal = await tx.proposal.findUnique({
          where: { id: proposalId },
          include: { lead: true },
        });
        if (!proposal || proposal.status !== 'ACCEPTED')
          throw new BadRequestException('Escolha uma proposta aceita.');
        if (proposal.lead?.clientId && proposal.lead.clientId !== dto.clientId)
          throw new BadRequestException('Proposta vinculada a outro cliente.');
        snapshot = json(proposal);
        const result = proposal.result as { monthlyCents?: number };
        const input = proposal.input as { setupCents?: number; offeringCodes?: string[] };
        monthlyCents ??= result.monthlyCents;
        setupCents ??= input.setupCents;
        if (!codes.length) codes = input.offeringCodes ?? [];
      }
      const row = await tx.contract.create({
        data: {
          ...data,
          ...this.dates(startsOn, endsOn),
          monthlyCents,
          setupCents,
          proposalId,
          proposalSnapshot: snapshot,
          services: { create: codes.map((code) => ({ code })) },
        },
        include,
      });
      await this.record(
        tx,
        row.id,
        actor,
        'CONTRACT_DRAFT_CREATED',
        'Rascunho administrativo sujeito a revisão.',
        null,
        row,
      );
      return this.public(row, role);
    });
  }
  async update(id: string, dto: UpdateContractDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      if (before.status !== 'DRAFT')
        throw new BadRequestException(
          'Edite somente rascunhos; use aditivo para reajustes formalizados.',
        );
      if (dto.requestKey !== undefined && dto.requestKey !== before.requestKey)
        throw new BadRequestException('Preserve a chave original.');
      if (
        (dto.clientId !== undefined && dto.clientId !== before.clientId) ||
        (dto.proposalId !== undefined && dto.proposalId !== before.proposalId)
      )
        throw new BadRequestException(
          'Cliente e proposta não podem ser substituídos neste rascunho.',
        );
      if (
        role !== 'OWNER' &&
        (dto.setupCents !== undefined ||
          dto.monthlyCents !== undefined ||
          dto.commercialTerms !== undefined ||
          dto.adjustmentTerms !== undefined ||
          dto.number !== undefined)
      )
        owner(role);
      if (dto.responsibleId) {
        if (role !== 'OWNER' && dto.responsibleId !== actor) owner(role);
        await actorActive(tx, dto.responsibleId);
      }
      if (
        dto.number &&
        (await tx.contract.findFirst({ where: { number: dto.number, id: { not: id } } }))
      )
        throw new ConflictException('Número contratual já utilizado.');
      const { version, serviceCodes, startsOn, endsOn, proposalId, clientId, requestKey, ...data } =
        dto;
      void proposalId;
      void clientId;
      void requestKey;
      const dates = this.dates(
        startsOn ?? before.startsOn?.toISOString().slice(0, 10),
        endsOn ?? before.endsOn?.toISOString().slice(0, 10),
      );
      if (serviceCodes) {
        await tx.contractService.deleteMany({ where: { contractId: id } });
        await tx.contractService.createMany({
          data: serviceCodes.map((code) => ({ contractId: id, code })),
        });
      }
      const row = await tx.contract.update({
        where: { id },
        data: { ...data, ...dates, version: version + 1 },
        include,
      });
      await this.record(tx, id, actor, 'CONTRACT_DRAFT_UPDATED', 'Rascunho revisado.', before, row);
      return this.public(row, role);
    });
  }
  async state(id: string, dto: ContractStateDto, actor: string, role: string) {
    owner(role);
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      expected(before, dto.version);
      if (!contractTransitions[before.status].includes(dto.status))
        throw new BadRequestException('Transição contratual não permitida.');
      if (dto.status === 'SIGNED' && (dto.signatureEvidence?.trim().length ?? 0) < 10)
        throw new BadRequestException(
          'Registre a evidência ou confirmação administrativa de assinatura.',
        );
      if (
        ['SIGNED', 'ACTIVE'].includes(dto.status) &&
        (!before.startsOn ||
          !before.endsOn ||
          before.monthlyCents === null ||
          before.setupCents === null ||
          !before.services.length)
      )
        throw new BadRequestException(
          'Complete vigência, serviços e valores antes da formalização.',
        );
      const now = validDate(today());
      if (dto.status === 'ACTIVE' && (before.startsOn! > now || before.endsOn! < now))
        throw new BadRequestException('A ativação exige vigência atual.');
      if (dto.status === 'EXPIRED' && (!before.endsOn || before.endsOn >= now))
        throw new BadRequestException('Contrato ainda não venceu.');
      const row = await tx.contract.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === 'SIGNED' ? { signatureEvidence: dto.signatureEvidence!.trim() } : {}),
          version: { increment: 1 },
        },
        include,
      });
      await this.record(tx, id, actor, 'CONTRACT_STATUS_CHANGED', dto.reason, before, row);
      return this.public(row, role);
    });
  }
  async amend(id: string, dto: AmendmentDto, actor: string, role: string) {
    owner(role);
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      const exists = await tx.contractAmendment.findUnique({
        where: { requestKey: dto.requestKey },
      });
      if (exists) {
        if (
          exists.contractId !== id ||
          exists.monthlyCents !== dto.monthlyCents ||
          exists.effectiveOn.toISOString().slice(0, 10) !== dto.effectiveOn
        )
          throw new ConflictException('Chave de aditivo já utilizada.');
        return exists;
      }
      expected(before, dto.version);
      if (!['SIGNED', 'ACTIVE'].includes(before.status))
        throw new BadRequestException('Reajuste exige contrato assinado ou ativo.');
      const effectiveOn = validDate(dto.effectiveOn);
      if (
        dto.effectiveOn < today() ||
        !before.startsOn ||
        effectiveOn < before.startsOn ||
        (before.endsOn && effectiveOn > before.endsOn)
      )
        throw new BadRequestException(
          'Reajuste deve vigorar dentro do contrato e não pode ser retroativo.',
        );
      if (before.amendments.some((a) => a.effectiveOn >= effectiveOn))
        throw new ConflictException(
          'Registre aditivos em ordem cronológica, com uma alteração por data.',
        );
      if (
        dto.documentId &&
        !(await tx.contractDocument.findFirst({ where: { id: dto.documentId, contractId: id } }))
      )
        throw new BadRequestException('Documento não pertence ao contrato.');
      const previousMonthlyCents = effectiveMonthly(before, dto.effectiveOn);
      if (previousMonthlyCents === null)
        throw new BadRequestException('Mensalidade anterior indefinida.');
      if (dto.percentBps !== undefined) {
        const calculated =
          (BigInt(previousMonthlyCents) * BigInt(10000 + dto.percentBps) + 5000n) / 10000n;
        if (calculated !== BigInt(dto.monthlyCents))
          throw new BadRequestException('Percentual e nova mensalidade não correspondem.');
      }
      const { version, ...data } = dto;
      void version;
      const row = await tx.contractAmendment.create({
        data: { ...data, effectiveOn, contractId: id, actorId: actor, previousMonthlyCents },
      });
      await tx.contract.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.record(
        tx,
        id,
        actor,
        'CONTRACT_AMENDMENT_RECORDED',
        dto.reason,
        { monthlyCents: previousMonthlyCents },
        row,
      );
      return row;
    });
  }
  async renew(id: string, dto: RenewalDto, actor: string, role: string) {
    owner(role);
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      const before = await this.require(id, actor, role, tx);
      const previous = await tx.contract.findUnique({ where: { renewedFromId: id }, include });
      if (previous) {
        if (previous.requestKey !== dto.requestKey)
          throw new ConflictException('Renovação já preparada.');
        return this.public(previous, role);
      }
      expected(before, dto.version);
      if (!['ACTIVE', 'EXPIRED'].includes(before.status) || !before.endsOn)
        throw new BadRequestException(
          'Renovação exige contrato ativo ou vencido com término definido.',
        );
      const dates = this.dates(dto.startsOn, dto.endsOn);
      if (dates.startsOn! <= before.endsOn)
        throw new BadRequestException('Nova vigência deve iniciar após o término anterior.');
      if (
        await tx.contract.findFirst({
          where: { OR: [{ number: dto.number }, { requestKey: dto.requestKey }] },
        })
      )
        throw new ConflictException('Identificador de renovação já utilizado.');
      const row = await tx.contract.create({
        data: {
          number: dto.number,
          requestKey: dto.requestKey,
          clientId: before.clientId,
          responsibleId: before.responsibleId,
          title: before.title + ' — renovação',
          description: before.description,
          ...dates,
          setupCents: 0,
          monthlyCents: effectiveMonthly(before, before.endsOn.toISOString().slice(0, 10)),
          billingPeriod: before.billingPeriod,
          commercialTerms: before.commercialTerms,
          adjustmentTerms: before.adjustmentTerms,
          renewedFromId: id,
          services: { create: before.services.map((s) => ({ code: s.code })) },
        },
        include,
      });
      await tx.contract.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.record(tx, id, actor, 'CONTRACT_RENEWAL_PREPARED', dto.reason, null, {
        renewalId: row.id,
      });
      await this.record(
        tx,
        row.id,
        actor,
        'CONTRACT_DRAFT_CREATED',
        'Renovação sujeita a revisão e nova formalização.',
        null,
        row,
      );
      return this.public(row, role);
    });
  }
  async financial(id: string, actor: string, role: string) {
    owner(role);
    await this.clients.require(id, actor, role);
    const [contracts, groups] = await Promise.all([
      this.db.contract.findMany({ where: { clientId: id }, include }),
      this.db.financialTransaction.groupBy({
        by: ['status', 'type'],
        where: { clientId: id },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);
    return {
      contracts: contracts.map((r) => this.public(r, role)),
      transactions: groups,
      note: 'Valores contratuais são previsões. Somente lançamentos SETTLED representam caixa realizado.',
    };
  }
}
