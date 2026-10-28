import { parseArgs } from 'node:util';

export class AdminCommandError extends Error {}

export function parseAdminOptions(command, args) {
  const names = {
    'bootstrap-owner': ['identity', 'confirm'],
    'recover-mfa': ['request', 'case', 'confirm', 'emergency-last-owner'],
  }[command];
  if (!names) throw new AdminCommandError('Comando administrativo desconhecido.');
  try {
    const parsed = parseArgs({
      args,
      options: Object.fromEntries(names.map((name) => [name, { type: 'string' }])),
      strict: true,
      allowPositionals: false,
      tokens: true,
    });
    const seen = new Set();
    for (const token of parsed.tokens) {
      if (seen.has(token.name)) throw new Error();
      seen.add(token.name);
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const value = parsed.values;
    if (command === 'bootstrap-owner') {
      if (!uuid.test(value.identity ?? '') || value.confirm !== 'BOOTSTRAP_LOCAL_OWNER')
        throw new Error();
    } else if (
      !uuid.test(value.request ?? '') ||
      !/^[A-Z0-9-]{6,64}$/.test(value.case ?? '') ||
      value.confirm !== 'RESET_MFA_AFTER_IDENTITY_VERIFICATION' ||
      (value['emergency-last-owner'] !== undefined && value['emergency-last-owner'] !== 'true')
    )
      throw new Error();
    return value;
  } catch {
    throw new AdminCommandError(
      'Argumentos inválidos, ausentes ou repetidos. Consulte --help; nenhuma alteração executada.',
    );
  }
}

export function assertLocalAdminTargets(settings, databaseUrl, nodeEnv) {
  const db = new URL(databaseUrl);
  const auth = new URL(settings.url);
  if (
    nodeEnv === 'production' ||
    settings.mode !== 'local' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(auth.hostname) ||
    auth.port !== '54321' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(db.hostname) ||
    db.port !== '5432' ||
    db.pathname !== '/vympa_connect'
  )
    throw new AdminCommandError(
      'Destino bloqueado: exige desenvolvimento local, Auth loopback:54321 e banco vympa_connect loopback:5432.',
    );
}

export function assertBootstrapIdentity(user, identity) {
  if (!user || user.id !== identity)
    throw new AdminCommandError('Identidade solicitada não encontrada no Auth local.');
  if (!user.email || !user.email_confirmed_at)
    throw new AdminCommandError('Identidade local exige e-mail presente e confirmado.');
  if (
    user.is_anonymous ||
    user.deleted_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  )
    throw new AdminCommandError('Identidade anônima, removida ou bloqueada não pode ser OWNER.');
}

export async function acquireAdminLock(tx) {
  // PostgreSQL retorna void; executeRaw mantém o lock sem desserializar esse resultado.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(723109)`;
}

export function safeAdminDiagnostic(error, stage) {
  if (error instanceof AdminCommandError) return error.message;
  const codes = {
    P2010: 'Falha SQL no PostgreSQL local; confira compatibilidade da consulta e migrations.',
    P2021: 'Tabela administrativa ausente; confira as migrations locais.',
    P2022: 'Coluna administrativa ausente; confira as migrations locais.',
    P2002: 'Conflito de unicidade; confira os perfis administrativos existentes.',
    P2034: 'Conflito transacional; verifique se outro provisionamento foi executado.',
    P2028: 'Transação encerrada ou expirada; verifique PostgreSQL e concorrência.',
    ECONNREFUSED: 'Conexão local recusada; confira os serviços Docker.',
    EACCES: 'Acesso ao serviço local negado pelo ambiente de execução.',
    EPERM: 'Acesso ao serviço local negado pelo ambiente de execução.',
  };
  return `${stage}: ${codes[error?.code] ?? 'Falha na etapa indicada; confira configuração e disponibilidade dos serviços locais.'}`;
}
