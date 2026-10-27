import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { requireAuthSettings, authSettings } from './auth-config.js';
import { encryptTokens, decryptTokens, hash, randomToken } from './session-crypto.js';
import { SupabaseIdentityService, type VerifiedIdentity } from './supabase-identity.service.js';
import type { AuthContext } from './auth.types.js';

export function readCookie(request: Request, name: string): string {
  const value =
    request.headers.cookie
      ?.split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith(name + '='))
      ?.slice(name.length + 1) ?? '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly identity: SupabaseIdentityService,
  ) {}

  cookieName(kind: 'session' | 'csrf') {
    return (authSettings().secure ? '__Host-' : '') + 'vympa_' + kind;
  }
  cookie(response: Response, kind: 'session' | 'csrf', value: string, maxAge = 8 * 3600_000) {
    response.cookie(this.cookieName(kind), value, {
      httpOnly: true,
      secure: authSettings().secure,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
  }
  async csrf(response: Response, request: Request) {
    requireAuthSettings();
    const token = randomToken();
    const raw = readCookie(request, this.cookieName('session'));
    if (raw)
      await this.db.authSession.updateMany({
        where: { id: hash(raw), revokedAt: null },
        data: { csrfHash: hash(token) },
      });
    this.cookie(response, 'csrf', token);
    return { csrfToken: token };
  }
  assertCsrf(request: Request) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const token = request.headers['x-csrf-token'];
    const cookie = readCookie(request, this.cookieName('csrf'));
    if (
      request.headers.origin !== authSettings().origin ||
      typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !cookie ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(cookie))
    )
      throw new ForbiddenException('CSRF inválido. Recarregue a página.');
  }

  async permitted(identity: VerifiedIdentity, allowRecovery = false) {
    const profile = await this.db.adminProfile.findUnique({ where: { identityId: identity.id } });
    if (profile) {
      if (
        (!profile.active && !(allowRecovery && profile.recoveryRequired)) ||
        !['OWNER', 'ADMIN'].includes(profile.role)
      )
        throw new ForbiddenException('Acesso administrativo não autorizado.');
      return profile;
    }
    const invitation = await this.db.adminInvitation.findFirst({
      where: {
        identityId: identity.id,
        email: identity.email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        issuedBy: { active: true, role: 'OWNER' },
      },
    });
    if (!invitation) throw new ForbiddenException('Acesso administrativo não autorizado.');
    return null;
  }

  async issue(session: Session, response: Response, request: Request, recovery = false) {
    const client = this.identity.client();
    const identity = await this.identity.verify(client, session.access_token);
    await this.permitted(identity, recovery);
    const raw = randomToken();
    const id = hash(raw);
    const csrf = randomToken();
    const previous = readCookie(request, this.cookieName('session'));
    await this.db.$transaction(async (tx) => {
      if (previous)
        await tx.authSession.updateMany({
          where: { id: hash(previous) },
          data: { revokedAt: new Date(), tokensCipher: '' },
        });
      await tx.authSession.create({
        data: {
          id,
          identityId: identity.id,
          tokensCipher: encryptTokens(
            this.identity.tokens(session),
            requireAuthSettings().encryptionKey,
            id,
          ),
          csrfHash: hash(csrf),
          recovery,
          expiresAt: new Date(Date.now() + 8 * 3600_000),
        },
      });
      await tx.adminAuditEvent.create({
        data: { action: recovery ? 'ACCESS_RECOVERY_STARTED' : 'LOGIN', targetId: identity.id },
      });
    });
    this.cookie(response, 'session', raw);
    this.cookie(response, 'csrf', csrf);
    return { csrfToken: csrf };
  }

  async login(email: string, password: string, response: Response, request: Request) {
    const client = this.identity.client();
    const { data, error } = await client.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });
    if (error || !data.session) {
      await this.db.adminAuditEvent.create({ data: { action: 'LOGIN_FAILED' } });
      if ((error?.status && error.status >= 500) || error?.name === 'AuthRetryableFetchError')
        throw new ServiceUnavailableException('Serviço de autenticação indisponível.');
      throw new UnauthorizedException('Credenciais inválidas ou acesso não autorizado.');
    }
    try {
      return await this.issue(data.session, response, request);
    } catch (error) {
      await client.auth.signOut({ scope: 'local' });
      if (error instanceof ForbiddenException)
        throw new UnauthorizedException('Credenciais inválidas ou acesso não autorizado.');
      throw error;
    }
  }

  async authenticate(request: Request): Promise<AuthContext> {
    const raw = readCookie(request, this.cookieName('session'));
    if (!raw) throw new UnauthorizedException('Sessão ausente ou inválida.');
    const id = hash(raw);
    // Bloqueio no banco serializa a rotação de refresh tokens entre processos da API.
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM vympa_private.auth_sessions WHERE id = ${id} FOR UPDATE`;
        const session = await tx.authSession.findUnique({ where: { id } });
        if (!session || session.revokedAt || session.expiresAt <= new Date())
          throw new UnauthorizedException('Sessão encerrada ou expirada.');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
          const token = request.headers['x-csrf-token'];
          if (typeof token !== 'string' || hash(token) !== session.csrfHash)
            throw new ForbiddenException('CSRF inválido.');
        }
        let tokens;
        try {
          tokens = decryptTokens(session.tokensCipher, requireAuthSettings().encryptionKey, id);
        } catch {
          throw new UnauthorizedException('Sessão inválida.');
        }
        const restored = await this.identity.restore(tokens);
        if (restored.identity.id !== session.identityId)
          throw new UnauthorizedException('Identidade de sessão inválida.');
        const profile = await this.permitted(restored.identity, session.recovery);
        await tx.authSession.update({
          where: { id },
          data: {
            tokensCipher: encryptTokens(
              this.identity.tokens(restored.session),
              requireAuthSettings().encryptionKey,
              id,
            ),
          },
        });
        return {
          sessionId: id,
          identity: restored.identity,
          client: restored.client,
          profile,
          recovery: session.recovery,
        };
      },
      { timeout: 30000 },
    );
  }

  async state(context: AuthContext) {
    const factors = await context.client.auth.mfa.listFactors();
    if (factors.error) throw new ServiceUnavailableException('Não foi possível consultar MFA.');
    const verified = factors.data.totp.filter((factor) => factor.status === 'verified');
    return {
      email: context.identity.email,
      role: context.profile?.role ?? null,
      state:
        context.identity.aal !== 'aal2'
          ? verified.length
            ? 'mfa_verify'
            : 'mfa_enroll'
          : context.recovery
            ? 'password'
            : !context.profile
              ? 'invitation'
              : 'ready',
      factors: verified.map((factor) => ({
        id: factor.id,
        name: factor.friendly_name ?? 'Autenticador',
      })),
    };
  }

  async saveTokens(context: AuthContext) {
    const { data } = await context.client.auth.getSession();
    if (!data.session) throw new UnauthorizedException('Sessão inválida.');
    const count = await this.db.authSession.updateMany({
      where: { id: context.sessionId, revokedAt: null },
      data: {
        tokensCipher: encryptTokens(
          this.identity.tokens(data.session),
          requireAuthSettings().encryptionKey,
          context.sessionId,
        ),
      },
    });
    if (!count.count) throw new UnauthorizedException('Sessão encerrada.');
  }

  async enroll(context: AuthContext) {
    const factors = await context.client.auth.mfa.listFactors();
    if (factors.error) throw new ServiceUnavailableException('Serviço MFA indisponível.');
    if (factors.data.totp.some((factor) => factor.status === 'verified'))
      throw new ForbiddenException('Use o autenticador já cadastrado.');
    for (const factor of factors.data.all.filter(
      (f) => f.status === 'unverified' && f.factor_type === 'totp',
    )) {
      const removed = await context.client.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error)
        throw new ServiceUnavailableException('Não foi possível reiniciar cadastro MFA.');
    }
    const result = await context.client.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'VYMPA Connect',
      friendlyName: 'VYMPA autenticador',
    });
    if (result.error)
      throw new ServiceUnavailableException('Não foi possível cadastrar autenticador.');
    // QR contém o segredo: só é retornado nesta resposta autenticada, sem cache ou auditoria do corpo.
    return { factorId: result.data.id, qrCode: result.data.totp.qr_code };
  }

  async verifyMfa(context: AuthContext, factorId: string, code: string) {
    const result = await context.client.auth.mfa.challengeAndVerify({ factorId, code });
    if (result.error) throw new UnauthorizedException('Código inválido ou expirado.');
    await this.saveTokens(context);
    await this.db.adminAuditEvent.create({
      data: { action: 'MFA_VERIFIED', actorId: context.profile?.id, targetId: context.identity.id },
    });
    return { verified: true };
  }

  async recover(email: string) {
    // O mesmo caminho do provedor é usado para e-mails conhecidos e desconhecidos.
    // A confirmação do link continua exigindo perfil ativo ou convite autorizado.
    const { error } = await this.identity.client().auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: authSettings().origin + '/auth/confirm',
    });
    if ((error?.status && error.status >= 500) || error?.name === 'AuthRetryableFetchError')
      throw new ServiceUnavailableException('Serviço de recuperação indisponível.');
    return { message: 'Se a conta estiver autorizada, você receberá instruções por e-mail.' };
  }

  async confirm(
    tokenHash: string,
    type: 'invite' | 'recovery',
    response: Response,
    request: Request,
  ) {
    const result = await this.identity.client().auth.verifyOtp({ token_hash: tokenHash, type });
    if (result.error || !result.data.session)
      throw new UnauthorizedException('Link inválido ou expirado.');
    // Convites precisam definir uma senha também; MFA continua obrigatório antes da ativação.
    return this.issue(result.data.session, response, request, true);
  }

  async password(context: AuthContext, password: string) {
    if (context.identity.aal !== 'aal2' || !context.recovery)
      throw new ForbiddenException('Recuperação autenticada e MFA obrigatórios.');
    const { error } = await context.client.auth.updateUser({ password });
    if (error)
      throw new ForbiddenException(
        'Não foi possível alterar a senha; confira os requisitos do provedor.',
      );
    await this.saveTokens(context);
    await this.db.$transaction([
      this.db.authSession.updateMany({
        where: { identityId: context.identity.id, id: { not: context.sessionId } },
        data: { revokedAt: new Date(), tokensCipher: '' },
      }),
      this.db.authSession.update({ where: { id: context.sessionId }, data: { recovery: false } }),
      ...(context.profile?.recoveryRequired
        ? [
            this.db.adminProfile.update({
              where: { id: context.profile.id },
              data: { active: true, recoveryRequired: false },
            }),
          ]
        : []),
      this.db.adminAuditEvent.create({
        data: {
          action: 'PASSWORD_CHANGED',
          actorId: context.profile?.id,
          targetId: context.identity.id,
        },
      }),
    ]);
    return { updated: true };
  }

  async accept(context: AuthContext) {
    if (context.identity.aal !== 'aal2' || context.recovery)
      throw new ForbiddenException('MFA e definição de senha obrigatórios.');
    return this.db.$transaction(
      async (tx) => {
        const invitation = await tx.adminInvitation.findFirst({
          where: {
            identityId: context.identity.id,
            email: context.identity.email,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            issuedBy: { active: true, role: 'OWNER' },
            role: 'ADMIN',
          },
        });
        if (!invitation) throw new ForbiddenException('Convite inválido, expirado ou revogado.');
        const used = await tx.adminInvitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date() },
        });
        if (used.count !== 1) throw new ForbiddenException('Convite já utilizado.');
        const profile = await tx.adminProfile.create({
          data: {
            identityId: context.identity.id,
            email: context.identity.email,
            role: invitation.role,
          },
        });
        await tx.adminAuditEvent.create({
          data: { action: 'INVITATION_ACCEPTED', actorId: profile.id, targetId: invitation.id },
        });
        return { accepted: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async requestMfaRecovery(context: AuthContext) {
    if (!context.profile?.active) throw new ForbiddenException('Perfil ativo obrigatório.');
    const actorId = context.profile.id;
    const request = await this.db.$transaction(async (tx) => {
      const value = await tx.mfaRecoveryRequest.create({
        data: { identityId: context.identity.id, expiresAt: new Date(Date.now() + 24 * 3600_000) },
      });
      await tx.adminAuditEvent.create({
        data: { action: 'MFA_RECOVERY_REQUESTED', actorId, targetId: value.id },
      });
      return value;
    });
    return {
      id: request.id,
      message:
        'Solicite verificação de identidade fora da plataforma. Um OWNER distinto aprova o pedido; a execução exige operador no servidor.',
    };
  }

  async logout(request: Request, response: Response) {
    const raw = readCookie(request, this.cookieName('session'));
    let remoteRevoked = true;
    if (raw) {
      const session = await this.db.authSession.findUnique({ where: { id: hash(raw) } });
      if (session && !session.revokedAt) {
        await this.db.$transaction([
          this.db.authSession.updateMany({
            where: { identityId: session.identityId },
            data: { revokedAt: new Date(), tokensCipher: '' },
          }),
          this.db.adminAuditEvent.create({
            data: { action: 'LOGOUT', targetId: session.identityId },
          }),
        ]);
        try {
          const tokens = decryptTokens(
            session.tokensCipher,
            requireAuthSettings().encryptionKey,
            session.id,
          );
          const { client } = await this.identity.restore(tokens);
          const { error } = await client.auth.signOut({ scope: 'global' });
          remoteRevoked = !error;
        } catch {
          remoteRevoked = false;
        }
      }
    }
    this.cookie(response, 'session', '', 0);
    this.cookie(response, 'csrf', '', 0);
    return { loggedOut: true, remoteRevocationPending: !remoteRevoked };
  }
}
