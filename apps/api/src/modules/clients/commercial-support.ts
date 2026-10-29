import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function validDate(s: string) {
  const d = new Date(s + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s)
    throw new BadRequestException('Data inválida.');
  return d;
}
export function cnpjValue(value?: string) {
  if (!value?.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z\d./-]+$/.test(normalized)) throw new BadRequestException('CNPJ inválido.');
  const n = normalized.replace(/[./-]/g, '');
  if (!/^[A-Z\d]{12}\d{2}$/.test(n) || /^(\d)\1+$/.test(n))
    throw new BadRequestException('CNPJ inválido.');
  for (const len of [12, 13]) {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    // Receita Federal: manual-dv-cnpj.pdf, each character is ASCII minus 48.
    const mod = weights.reduce((sum, w, i) => sum + (n.charCodeAt(i) - 48) * w, 0) % 11;
    if (Number(n[len]) !== (mod < 2 ? 0 : 11 - mod))
      throw new BadRequestException('CNPJ inválido.');
  }
  return n;
}
export function owner(role: string) {
  if (role !== 'OWNER')
    throw new ForbiddenException('Somente OWNER pode alterar condições e valores contratuais.');
}
export async function commercialLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(723117)`;
}
export async function clientAccess(
  tx: Prisma.TransactionClient,
  id: string,
  actor: string,
  role: string,
) {
  const row = await tx.client.findUnique({ where: { id } });
  if (row && role !== 'OWNER' && row.responsibleId !== actor)
    throw new ForbiddenException('Cliente não autorizado.');
  return row;
}
export function effectiveMonthly(
  contract: {
    monthlyCents: number | null;
    amendments?: { effectiveOn: Date; monthlyCents: number }[];
  },
  on = today(),
) {
  const changes = contract.amendments
    ?.filter((a) => a.effectiveOn.toISOString().slice(0, 10) <= on)
    .sort((a, b) => b.effectiveOn.getTime() - a.effectiveOn.getTime());
  return changes?.[0]?.monthlyCents ?? contract.monthlyCents;
}
export function contractPublic<
  T extends {
    setupCents?: unknown;
    monthlyCents?: unknown;
    commercialTerms?: unknown;
    adjustmentTerms?: unknown;
    proposalSnapshot?: unknown;
    amendments?: unknown;
    history?: unknown;
  },
>(row: T, role: string) {
  if (role === 'OWNER') return row;
  const {
    setupCents,
    monthlyCents,
    commercialTerms,
    adjustmentTerms,
    proposalSnapshot,
    amendments,
    history,
    ...safe
  } = row;
  void setupCents;
  void monthlyCents;
  void commercialTerms;
  void adjustmentTerms;
  void proposalSnapshot;
  void amendments;
  void history;
  return safe;
}
