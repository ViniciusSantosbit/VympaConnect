import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
import { requireAuthSettings } from '../src/modules/auth/auth-config.ts';
import { decryptTokens } from '../src/modules/auth/session-crypto.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const [command, ...args] = process.argv.slice(2);
const options = Object.fromEntries(args.map((arg) => arg.replace(/^--/, '').split('=')));
let db;
try {
  if (args.includes('--help') || !command) {
    console.log(
      'Nenhuma alteração executada. Use somente após migration local e configuração Auth isolada.',
    );
    console.log(
      'bootstrap-owner --identity=UUID --confirm=BOOTSTRAP_LOCAL_OWNER: vincula identidade Auth já existente e confirmada. Não cria conta ou senha. Recusa bootstrap se já houver perfil.',
    );
    console.log(
      'recover-mfa --request=UUID --case=INCIDENTE-123 --confirm=RESET_MFA_AFTER_IDENTITY_VERIFICATION: exige aprovação de outro OWNER e verificação de identidade por canal independente, registrada no incidente.',
    );
    console.log(
      'Emergência do único OWNER: requer AUTH_ENABLE_BREAK_GLASS=true no ambiente seguro, --emergency-last-owner=true e verificação independente por dois operadores. Registrar incidente antes de executar. Nunca disponibilizar esse caminho por HTTP.',
    );
    process.exit(0);
  }
  if (process.env.VYMPA_DATABASE_TARGET && process.env.VYMPA_DATABASE_TARGET !== 'local')
    throw new Error();
  process.env.VYMPA_DATABASE_TARGET = 'local';
  loadDatabaseEnvironment();
  const settings = requireAuthSettings();
  if (!settings.secretKey) throw new Error();
  const auth = createClient(settings.url, settings.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
  db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(process.env.DATABASE_URL)) });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (command === 'bootstrap-owner') {
    if (!uuid.test(options.identity ?? '') || options.confirm !== 'BOOTSTRAP_LOCAL_OWNER')
      throw new Error();
    const { data, error } = await auth.auth.admin.getUserById(options.identity);
    const user = data.user;
    if (error || !user?.email_confirmed_at || !user.email || user.is_anonymous) throw new Error();
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(723109)`;
        if ((await tx.adminProfile.count()) !== 0) throw new Error();
        const profile = await tx.adminProfile.create({
          data: { identityId: user.id, email: user.email.toLowerCase(), role: 'OWNER' },
        });
        await tx.adminAuditEvent.create({
          data: { action: 'OWNER_BOOTSTRAPPED_OFFLINE', targetId: profile.id },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    console.log('Primeiro OWNER vinculado. O acesso ao painel ainda exige login e MFA.');
  } else if (command === 'recover-mfa') {
    if (
      !uuid.test(options.request ?? '') ||
      !/^[A-Z0-9-]{6,64}$/.test(options.case ?? '') ||
      options.confirm !== 'RESET_MFA_AFTER_IDENTITY_VERIFICATION'
    )
      throw new Error();
    const target = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(723109)`;
        const request = await tx.mfaRecoveryRequest.findUnique({ where: { id: options.request } });
        if (!request) throw new Error();
        const profile = await tx.adminProfile.findUnique({
          where: { identityId: request.identityId },
        });
        if (!profile) throw new Error();
        if (
          request.executedAt &&
          (!profile.recoveryRequired || request.caseReference !== options.case)
        )
          throw new Error();
        if (
          request.expiresAt <= new Date() &&
          !(
            request.executedAt &&
            profile.recoveryRequired &&
            request.caseReference === options.case
          )
        )
          throw new Error();
        const owner = request.approvedById
          ? await tx.adminProfile.findUnique({ where: { id: request.approvedById } })
          : null;
        const approved =
          owner?.active && owner.role === 'OWNER' && owner.id !== profile.id && request.approvedAt;
        const emergency =
          options['emergency-last-owner'] === 'true' &&
          process.env.AUTH_ENABLE_BREAK_GLASS === 'true' &&
          profile.role === 'OWNER' &&
          (await tx.adminProfile.count({
            where: { role: 'OWNER', active: true, id: { not: profile.id } },
          })) === 0;
        if (!approved && !emergency) throw new Error();
        const sessions = await tx.authSession.findMany({
          where: { identityId: profile.identityId, revokedAt: null },
        });
        await tx.adminProfile.update({
          where: { id: profile.id },
          data: { active: false, recoveryRequired: true },
        });
        await tx.authSession.updateMany({
          where: { identityId: profile.identityId },
          data: { revokedAt: new Date(), tokensCipher: '' },
        });
        await tx.mfaRecoveryRequest.update({
          where: { id: request.id },
          data: { executedAt: new Date(), caseReference: options.case },
        });
        await tx.adminAuditEvent.create({
          data: {
            id: randomUUID(),
            action: emergency ? 'MFA_BREAK_GLASS_OFFLINE' : 'MFA_RECOVERY_EXECUTED_OFFLINE',
            actorId: owner?.id,
            targetId: request.id,
          },
        });
        return { profile, sessions };
      },
      { isolationLevel: 'Serializable' },
    );
    // A partir daqui, qualquer falha mantém a conta desativada e as sessões VYMPA revogadas.
    for (const session of target.sessions) {
      const tokens = decryptTokens(session.tokensCipher, settings.encryptionKey, session.id);
      await auth.auth.admin.signOut(tokens.access_token, 'global');
    }
    const factors = await auth.auth.admin.mfa.listFactors({ userId: target.profile.identityId });
    if (factors.error) throw new Error();
    for (const factor of factors.data.factors) {
      const result = await auth.auth.admin.mfa.deleteFactor({
        userId: target.profile.identityId,
        id: factor.id,
      });
      if (result.error) throw new Error();
    }
    const sent = await auth.auth.resetPasswordForEmail(target.profile.email, {
      redirectTo: settings.origin + '/auth/confirm',
    });
    if (sent.error) throw new Error();
    console.log(
      'Recuperação iniciada. Perfil desativado e sessões VYMPA revogadas. O titular deve confirmar o link, recadastrar MFA e alterar a senha para reativar o perfil. Registre o resultado no incidente informado.',
    );
  } else throw new Error();
} catch {
  console.error(
    'Operação administrativa não concluída. Confira argumentos, confirmação, aprovação vigente, identidade e configuração local. Nenhum segredo foi registrado. Se a recuperação já iniciou, o perfil permanece desativado até concluir ou retomar o procedimento.',
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
