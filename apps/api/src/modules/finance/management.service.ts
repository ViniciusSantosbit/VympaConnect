import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  EntryDto,
  CategoryDto,
  OpeningDto,
  PeriodDto,
  RecurringDto,
  InvestmentDto,
  PayInvestmentDto,
  AiCostDto,
} from './finance.dto.js';
import {
  actorActive,
  audit,
  currentPeriod,
  date,
  expected,
  json,
  lock,
  periodRange,
} from './finance-support.js';
const today = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
@Injectable()
export class ManagementService {
  constructor(private readonly db: DatabaseService) {}
  categories() {
    return this.db.financialCategory.findMany({ orderBy: { name: 'asc' } });
  }
  async category(dto: CategoryDto, actor: string, id?: string) {
    return this.db.$transaction(async (tx) => {
      if (id) await lock(tx, 'financial_categories', id);
      const before = id ? await tx.financialCategory.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Categoria não encontrada.');
      expected(before, dto.version);
      const { version, ...data } = dto;
      const after = before
        ? await tx.financialCategory.update({
            where: { id },
            data: { ...data, version: version + 1 },
          })
        : await tx.financialCategory.create({ data });
      await audit(tx, actor, 'CATEGORY_SAVED', after.id, before, after);
      return after;
    });
  }
  private async activeCategory(tx: Prisma.TransactionClient, id: string) {
    const category = await tx.financialCategory.findFirst({ where: { id, active: true } });
    if (!category) throw new BadRequestException('Escolha uma categoria ativa.');
    return category;
  }
  private async entryData(tx: Prisma.TransactionClient, dto: EntryDto) {
    if (dto.status === 'SETTLED' && !dto.settledOn)
      throw new BadRequestException('Informe a data efetiva de recebimento ou pagamento.');
    if (dto.status === 'SETTLED' && dto.settledOn! > today())
      throw new BadRequestException(
        'Recebimentos e pagamentos realizados não podem ter data futura.',
      );
    if (dto.status !== 'SETTLED' && dto.settledOn)
      throw new BadRequestException('Somente lançamentos realizados podem ter data de caixa.');
    const category = await this.activeCategory(tx, dto.categoryId);
    if (dto.contractId && (!dto.clientId || !dto.billingReference))
      throw new BadRequestException('Cobrança contratual exige cliente e referência única.');
    if (dto.clientId && !(await tx.client.findUnique({ where: { id: dto.clientId } })))
      throw new BadRequestException('Cliente não encontrado.');
    if (
      dto.contractId &&
      !(await tx.contract.findFirst({ where: { id: dto.contractId, clientId: dto.clientId } }))
    )
      throw new BadRequestException('Contrato não pertence ao cliente.');
    return {
      description: dto.description.trim(),
      type: dto.type,
      amountCents: dto.amountCents,
      competenceOn: date(dto.competenceOn),
      dueOn: dto.dueOn ? date(dto.dueOn) : null,
      settledOn: dto.settledOn ? date(dto.settledOn) : null,
      status: dto.status,
      categoryId: dto.categoryId,
      categoryGroup: category.group,
      counterparty: dto.counterparty || null,
      serviceReference: dto.serviceReference || null,
      paymentMethod: dto.paymentMethod || null,
      notes: dto.notes || null,
      ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
      ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
      ...(dto.billingReference !== undefined ? { billingReference: dto.billingReference } : {}),
    };
  }
  async saveEntry(dto: EntryDto, actor: string, id?: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.requestKey}))`;
      if (id) await lock(tx, 'financial_transactions', id);
      const before = id
        ? await tx.financialTransaction.findUnique({
            where: { id },
            include: { investment: true, aiCost: true },
          })
        : null;
      if (id && !before) throw new NotFoundException('Lançamento não encontrado.');
      if (before) {
        expected(before, dto.version);
        for (const field of ['clientId', 'contractId', 'billingReference'] as const) {
          if (dto[field] !== undefined && dto[field] !== before[field])
            throw new BadRequestException(
              'Vínculos de cobrança devem ser preservados. Cancele o lançamento para corrigir.',
            );
        }
        if (before.requestKey !== dto.requestKey)
          throw new BadRequestException('A chave original do lançamento deve ser preservada.');
        if (before.status === 'CANCELLED')
          throw new ConflictException('Lançamento cancelado é histórico imutável.');
        if ((before.investment || before.aiCost) && dto.status !== 'CANCELLED')
          throw new BadRequestException(
            'Lançamento vinculado a investimento ou IA: cancele para corrigir sem duplicar valores.',
          );
      }
      const data = await this.entryData(tx, dto);
      if (!before) {
        const existing = await tx.financialTransaction.findUnique({
          where: { requestKey: dto.requestKey },
        });
        if (existing) {
          const comparable = Object.fromEntries(
            Object.keys(data).map((k) => [k, existing[k as keyof typeof existing]]),
          );
          if (JSON.stringify(json(comparable)) !== JSON.stringify(json(data)))
            throw new ConflictException('Chave de envio já usada com outros dados.');
          return existing;
        }
      }
      const after = before
        ? await tx.financialTransaction.update({
            where: { id },
            data: { ...data, version: before.version + 1 },
          })
        : await tx.financialTransaction.create({
            data: { ...data, requestKey: dto.requestKey, createdById: actor },
          });
      if (before?.investment && dto.status === 'CANCELLED') {
        const inv = await tx.investment.update({
          where: { id: before.investment.id },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        await audit(tx, actor, 'INVESTMENT_PAYMENT_CANCELLED', inv.id, before.investment, inv);
      }
      await audit(
        tx,
        actor,
        before ? 'FINANCIAL_ENTRY_UPDATED' : 'FINANCIAL_ENTRY_CREATED',
        after.id,
        before,
        after,
      );
      return after;
    });
  }
  async entries(q: PeriodDto) {
    const { start, end } = periodRange(q.period);
    const where: Prisma.FinancialTransactionWhereInput = {
      categoryId: q.categoryId,
      type: q.type,
      status: q.status,
      ...(q.basis === 'CASH'
        ? { settledOn: { gte: start, lt: end } }
        : { competenceOn: { gte: start, lt: end } }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.financialTransaction.findMany({
        where,
        include: { category: true, investment: true, aiCost: true },
        orderBy: [{ competenceOn: 'desc' }, { id: 'desc' }],
        take: 30,
        skip: ((q.page ?? 1) - 1) * 30,
      }),
      this.db.financialTransaction.count({ where }),
    ]);
    return { items, total, page: q.page ?? 1, pageSize: 30 };
  }
  opening() {
    return this.db.financialOpeningBalance.findUnique({ where: { id: 'default' } });
  }
  async saveOpening(dto: OpeningDto, actor: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(723113)`;
      const before = await tx.financialOpeningBalance.findUnique({ where: { id: 'default' } });
      expected(before, dto.version);
      const data = {
        amountCents: dto.amountCents,
        effectiveOn: date(dto.effectiveOn),
        version: dto.version + 1,
      };
      const after = await tx.financialOpeningBalance.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...data },
        update: data,
      });
      await audit(tx, actor, 'OPENING_BALANCE_CHANGED', 'default', before, after);
      return after;
    });
  }
  async summary(q: PeriodDto = { page: 1 }) {
    return this.db.$transaction(
      async (tx) => {
        const { period, start, end } = periodRange(q.period);
        const opening = await tx.financialOpeningBalance.findUnique({ where: { id: 'default' } });
        const applies = !!opening && opening.effectiveOn < end;
        const effective = applies ? opening!.effectiveOn : date('1970-01-01');
        const totals = await tx.financialTransaction.groupBy({
          by: ['type', 'categoryGroup'],
          where: { status: 'SETTLED', settledOn: { gte: start, lt: end } },
          _sum: { amountCents: true },
        });
        const cumulative = await tx.financialTransaction.groupBy({
          by: ['type'],
          where: { status: 'SETTLED', settledOn: { gte: effective, lt: end } },
          _sum: { amountCents: true },
        });
        const pending = await tx.financialTransaction.groupBy({
          by: ['type'],
          where: {
            status: { in: ['PLANNED', 'PENDING'] },
            OR: [
              { dueOn: { gte: start, lt: end } },
              { dueOn: null, competenceOn: { gte: start, lt: end } },
            ],
          },
          _sum: { amountCents: true },
        });
        const chartStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 11, 1));
        const evolution = await tx.financialTransaction.groupBy({
          by: ['settledOn', 'type'],
          where: {
            status: 'SETTLED',
            settledOn: { gte: chartStart, lt: end },
            categoryId: q.categoryId,
            type: q.type,
          },
          _sum: { amountCents: true },
        });
        const sum = (type: string) =>
          totals.filter((r) => r.type === type).reduce((n, r) => n + (r._sum.amountCents ?? 0), 0);
        const receivedCents = sum('INCOME'),
          paidCents = sum('EXPENSE');
        const balanceCents =
          (applies ? opening!.amountCents : 0) +
          cumulative.reduce(
            (n, r) => n + (r.type === 'INCOME' ? 1 : -1) * (r._sum.amountCents ?? 0),
            0,
          );
        const pendingIncomeCents = pending
            .filter((r) => r.type === 'INCOME')
            .reduce((n, r) => n + (r._sum.amountCents ?? 0), 0),
          pendingExpenseCents = pending
            .filter((r) => r.type === 'EXPENSE')
            .reduce((n, r) => n + (r._sum.amountCents ?? 0), 0);
        const months = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(
            Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + i, 1),
          );
          const key = d.toISOString().slice(0, 7);
          const rows = evolution.filter((r) => r.settledOn?.toISOString().slice(0, 7) === key);
          return {
            period: key,
            incomeCents: rows
              .filter((r) => r.type === 'INCOME')
              .reduce((n, r) => n + (r._sum.amountCents ?? 0), 0),
            expenseCents: rows
              .filter((r) => r.type === 'EXPENSE')
              .reduce((n, r) => n + (r._sum.amountCents ?? 0), 0),
          };
        });
        const group = (g: string) =>
          totals
            .filter((r) => r.type === 'EXPENSE' && r.categoryGroup === g)
            .reduce((n, r) => n + (r._sum.amountCents ?? 0), 0);
        return {
          period,
          currency: 'BRL',
          receivedCents,
          paidCents,
          balanceCents,
          resultCents: receivedCents - paidCents,
          pendingIncomeCents,
          pendingExpenseCents,
          forecastCents: balanceCents + pendingIncomeCents - pendingExpenseCents,
          aiCents: group('AI'),
          infrastructureCents: group('INFRA'),
          investmentCents: group('INVESTMENT'),
          opening,
          months,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  recurring() {
    return this.db.recurringTransaction.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async saveRecurring(dto: RecurringDto, actor: string, id?: string) {
    if (dto.endsOn && dto.endsOn < dto.startsOn)
      throw new BadRequestException('Fim da recorrência deve ser posterior ao início.');
    return this.db.$transaction(async (tx) => {
      if (id) await lock(tx, 'recurring_transactions', id);
      const before = id ? await tx.recurringTransaction.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException();
      expected(before, dto.version);
      await this.activeCategory(tx, dto.categoryId);
      const { version, startsOn, endsOn, ...rest } = dto;
      const data = {
        ...rest,
        startsOn: date(startsOn),
        endsOn: endsOn ? date(endsOn) : null,
        version: version + 1,
      };
      const after = before
        ? await tx.recurringTransaction.update({ where: { id }, data })
        : await tx.recurringTransaction.create({ data });
      await audit(tx, actor, 'RECURRING_SAVED', after.id, before, after);
      return after;
    });
  }
  async generateRecurring(id: string, period: string, actor: string) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'recurring_transactions', id);
      const rule = await tx.recurringTransaction.findUnique({ where: { id } });
      if (!rule?.active) throw new BadRequestException('Recorrência inativa ou inexistente.');
      const key = id + ':' + period;
      const existing = await tx.financialTransaction.findUnique({ where: { requestKey: key } });
      if (existing) return existing;
      const { start, end } = periodRange(period);
      const day = Math.min(rule.dueDay, new Date(end.getTime() - 86400000).getUTCDate());
      const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
      if (due < rule.startsOn || (rule.endsOn && due > rule.endsOn))
        throw new BadRequestException('Período fora da vigência.');
      const category = await this.activeCategory(tx, rule.categoryId);
      const after = await tx.financialTransaction.create({
        data: {
          requestKey: key,
          description: rule.description,
          type: 'EXPENSE',
          amountCents: rule.amountCents,
          categoryId: rule.categoryId,
          categoryGroup: category.group,
          competenceOn: start,
          dueOn: due,
          status: 'PENDING',
          counterparty: rule.supplier,
          notes: rule.notes,
          createdById: actor,
          recurringId: id,
          recurrencePeriod: period,
        },
      });
      await audit(tx, actor, 'RECURRING_ENTRY_GENERATED', after.id, null, after);
      return after;
    });
  }
  investments() {
    return this.db.investment.findMany({
      include: {
        transaction: true,
        category: true,
        responsible: { select: { id: true, email: true } },
      },
      orderBy: { plannedOn: 'desc' },
      take: 100,
    });
  }
  async saveInvestment(dto: InvestmentDto, actor: string, id?: string) {
    return this.db.$transaction(async (tx) => {
      if (id) await lock(tx, 'investments', id);
      const before = id ? await tx.investment.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException();
      expected(before, dto.version);
      if (before?.transactionId)
        throw new ConflictException(
          'Investimento com pagamento vinculado deve ser corrigido pelo cancelamento do lançamento.',
        );
      await this.activeCategory(tx, dto.categoryId);
      await actorActive(tx, dto.responsibleId);
      const { version, plannedOn, ...data } = dto;
      const after = before
        ? await tx.investment.update({
            where: { id },
            data: { ...data, plannedOn: date(plannedOn), version: version + 1 },
          })
        : await tx.investment.create({ data: { ...data, plannedOn: date(plannedOn) } });
      await audit(tx, actor, 'INVESTMENT_SAVED', after.id, before, after);
      return after;
    });
  }
  async payInvestment(id: string, dto: PayInvestmentDto, actor: string) {
    if (dto.settledOn > today())
      throw new BadRequestException('Pagamento realizado não pode ter data futura.');
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'investments', id);
      const before = await tx.investment.findUnique({
        where: { id },
        include: { transaction: true },
      });
      if (!before) throw new NotFoundException();
      if (before.transactionId) {
        if (
          before.transaction?.requestKey === dto.requestKey &&
          before.transaction.amountCents === dto.amountCents &&
          before.transaction.settledOn?.toISOString().slice(0, 10) === dto.settledOn
        )
          return before;
        throw new ConflictException('Investimento já possui pagamento vinculado.');
      }
      expected(before, dto.version);
      if (before.status === 'CANCELLED') throw new BadRequestException('Investimento cancelado.');
      await this.activeCategory(tx, before.categoryId);
      const entry = await tx.financialTransaction.create({
        data: {
          requestKey: dto.requestKey,
          description: 'Investimento: ' + before.name,
          type: 'EXPENSE',
          amountCents: dto.amountCents,
          status: 'SETTLED',
          competenceOn: date(dto.settledOn),
          settledOn: date(dto.settledOn),
          categoryId: before.categoryId,
          categoryGroup: 'INVESTMENT',
          createdById: actor,
        },
      });
      const after = await tx.investment.update({
        where: { id },
        data: {
          status: 'PAID',
          actualCents: dto.amountCents,
          transactionId: entry.id,
          version: before.version + 1,
        },
      });
      await audit(tx, actor, 'INVESTMENT_PAID', id, before, after);
      await audit(tx, actor, 'FINANCIAL_ENTRY_CREATED', entry.id, null, entry);
      return after;
    });
  }
  aiCosts(period = currentPeriod()) {
    return this.db.aiCost.findMany({
      where: { period },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async saveAi(dto: AiCostDto, actor: string, id?: string) {
    return this.db.$transaction(async (tx) => {
      if (id) await lock(tx, 'ai_costs', id);
      const before = id ? await tx.aiCost.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException();
      expected(before, dto.version);
      if (dto.transactionId) {
        await lock(tx, 'financial_transactions', dto.transactionId);
        const entry = await tx.financialTransaction.findUnique({
          where: { id: dto.transactionId },
        });
        if (
          !entry ||
          entry.type !== 'EXPENSE' ||
          entry.categoryGroup !== 'AI' ||
          entry.status === 'CANCELLED' ||
          entry.amountCents !== dto.amountCents
        )
          throw new BadRequestException('Vincule uma despesa de IA válida com o mesmo valor.');
      }
      const { version, ...data } = dto;
      const after = before
        ? await tx.aiCost.update({ where: { id }, data: { ...data, version: version + 1 } })
        : await tx.aiCost.create({ data });
      await audit(tx, actor, 'AI_COST_SAVED', after.id, before, after);
      return after;
    });
  }
  audits() {
    return this.db.financeAuditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { email: true } } },
    });
  }
}
