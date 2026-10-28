import { loadDatabaseEnvironment, databaseOptions } from '../src/config/database-environment.ts';
import { requireAuthSettings } from '../src/modules/auth/auth-config.ts';
import { decryptTokens } from '../src/modules/auth/session-crypto.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  AdminCommandError,
  parseAdminOptions,
  assertLocalAdminTargets,
  assertBootstrapIdentity,
  acquireAdminLock,
  safeAdminDiagnostic,
} from './auth-admin-support.mjs';

const [command, ...args] = process.argv.slice(2);
let db;
let stage = 'Validação dos argumentos';
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
  const options = parseAdminOptions(command, args);
  stage = 'Configuração local';
  if (process.env.VYMPA_DATABASE_TARGET && process.env.VYMPA_DATABASE_TARGET !== 'local')
    throw new AdminCommandError('Operação bloqueada: VYMPA_DATABASE_TARGET deve ser local.');
  process.env.VYMPA_DATABASE_TARGET = 'local';
  loadDatabaseEnvironment();
  const settings = requireAuthSettings();
  assertLocalAdminTargets(settings, process.env.DATABASE_URL, process.env.NODE_ENV);
  if (!settings.secretKey)
    throw new AdminCommandError(
      'Chave administrativa Auth local ausente; execute auth:configure-local.',
    );
  const auth = createClient(settings.url, settings.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
  db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(process.env.DATABASE_URL)) });
  if (command === 'bootstrap-owner') {
    stage = 'Consulta da identidade no Supabase Auth local';
    const { data, error } = await auth.auth.admin.getUserById(options.identity);
    if (error)
      throw new AdminCommandError(
        error.status === 404
          ? 'Identidade solicitada não encontrada no Auth local.'
          : error.status === 401 || error.status === 403
            ? 'Auth local recusou a chave administrativa; execute auth:configure-local.'
            : 'Consulta da identidade falhou; confira disponibilidade do Supabase Auth local.',
      );
    const user = data?.user;
    assertBootstrapIdentity(user, options.identity);
    stage = 'Transação de provisionamento no PostgreSQL local';
    await db.$transaction(
      async (tx) => {
        await acquireAdminLock(tx);
        if ((await tx.adminProfile.count()) !== 0)
          throw new AdminCommandError(
            'Bootstrap recusado: já existe perfil administrativo. Nenhum privilégio alterado.',
          );
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
    stage = 'Recuperação MFA local (exige aprovação vigente)';
    const target = await db.$transaction(
      async (tx) => {
        await acquireAdminLock(tx);
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
} catch (error) {
  console.error('Operação administrativa não concluída. ' + safeAdminDiagnostic(error, stage));
  console.error(
    'Nenhum segredo foi registrado. Se a recuperação já iniciou, o perfil permanece desativado até concluir ou retomar o procedimento.',
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
