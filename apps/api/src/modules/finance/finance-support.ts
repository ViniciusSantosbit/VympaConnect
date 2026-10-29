import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const date = (value: string) => new Date(value + 'T00:00:00.000Z');
export function expected(row: { version: number } | null, version: number | undefined) {
  if ((row?.version ?? 0) !== version)
    throw new ConflictException(
      'Registro alterado por outro administrador. Recarregue antes de salvar.',
    );
}
export async function actorActive(tx: Prisma.TransactionClient, id: string) {
  if (!(await tx.adminProfile.findFirst({ where: { id, active: true } })))
    throw new BadRequestException('Responsável deve ser administrador ativo.');
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.financeAuditEvent.create({
    data: {
      actorId,
      action,
      entityId,
      before: before == null ? Prisma.DbNull : json(before),
      after: json(after),
    },
  });
}
export async function lock(
  tx: Prisma.TransactionClient,
  table:
    | 'proposals'
    | 'financial_transactions'
    | 'investments'
    | 'recurring_transactions'
    | 'ai_costs'
    | 'financial_categories',
  id: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM vympa_private.${Prisma.raw('"' + table + '"')} WHERE id=${id}::uuid FOR UPDATE`,
  );
}
export function currentPeriod() {
  const p = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return p.find((x) => x.type === 'year')!.value + '-' + p.find((x) => x.type === 'month')!.value;
}
export function periodRange(period = currentPeriod()) {
  const [y, m] = period.split('-').map(Number);
  return { period, start: new Date(Date.UTC(y!, m! - 1, 1)), end: new Date(Date.UTC(y!, m!, 1)) };
}
