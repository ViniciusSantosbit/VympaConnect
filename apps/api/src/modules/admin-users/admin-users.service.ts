import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { SupabaseIdentityService } from '../auth/supabase-identity.service.js';
import { authSettings } from '../auth/auth-config.js';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly identity: SupabaseIdentityService,
  ) {}
  list() {
    return this.db.adminProfile.findMany({
      select: { id: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }
  invitations() {
    return this.db.adminInvitation.findMany({
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
  async invite(actorId: string, email: string) {
    email = email.trim().toLowerCase();
    const admin = this.identity.client(true);
    const invitation = await this.db.$transaction(
      async (tx) => {
        const actor = await tx.adminProfile.findUnique({ where: { id: actorId } });
        if (!actor?.active || actor.role !== 'OWNER') throw new ForbiddenException();
        if (await tx.adminProfile.findUnique({ where: { email } }))
          throw new ConflictException('Perfil já cadastrado.');
        await tx.adminInvitation.updateMany({
          where: { email, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const record = await tx.adminInvitation.create({
          data: {
            email,
            issuedById: actorId,
            role: 'ADMIN',
            expiresAt: new Date(Date.now() + 48 * 3600_000),
          },
        });
        await tx.adminAuditEvent.create({
          data: { action: 'INVITATION_CREATED', actorId, targetId: record.id },
        });
        return record;
      },
      { isolationLevel: 'Serializable' },
    );
    // Saga: uma falha no provedor revoga o convite local; nenhuma identidade recebe perfil automaticamente.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: authSettings().origin + '/auth/confirm',
    });
    if (error || !data.user) {
      await this.db.$transaction([
        this.db.adminInvitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date() },
        }),
        this.db.adminAuditEvent.create({
          data: { action: 'INVITATION_DELIVERY_FAILED', actorId, targetId: invitation.id },
        }),
      ]);
      throw new ServiceUnavailableException(
        'Não foi possível enviar o convite. Confira o provedor de identidade e se o e-mail já foi cadastrado.',
      );
    }
    await this.db.adminInvitation.update({
      where: { id: invitation.id },
      data: { identityId: data.user.id },
    });
    return { id: invitation.id, email, expiresAt: invitation.expiresAt };
  }
  async revoke(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.adminInvitation.updateMany({
        where: { id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!changed.count) throw new ConflictException('Convite já encerrado ou inexistente.');
      await tx.adminAuditEvent.create({
        data: { action: 'INVITATION_REVOKED', actorId, targetId: id },
      });
      return { revoked: true };
    });
  }
  async change(
    actorId: string,
    id: string,
    change: { active?: boolean; role?: 'OWNER' | 'ADMIN' },
  ) {
    return this.db.$transaction(
      async (tx) => {
        // Bloqueio compartilhado por todas as alterações de OWNER evita remover o último em concorrência.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(723109)`;
        const actor = await tx.adminProfile.findUnique({ where: { id: actorId } });
        if (!actor?.active || actor.role !== 'OWNER') throw new ForbiddenException();
        const target = await tx.adminProfile.findUnique({ where: { id } });
        if (!target) throw new NotFoundException('Administrador não encontrado.');
        if (target.recoveryRequired)
          throw new ConflictException(
            'Conclua a recuperação autenticada antes de alterar este perfil.',
          );
        if (actorId === id)
          throw new ForbiddenException('Alterações do próprio acesso exigem outro OWNER.');
        if (
          target.active &&
          target.role === 'OWNER' &&
          (change.active === false || change.role === 'ADMIN')
        ) {
          if ((await tx.adminProfile.count({ where: { active: true, role: 'OWNER' } })) <= 1)
            throw new ConflictException('Não é permitido remover o último OWNER ativo.');
        }
        const updated = await tx.adminProfile.update({
          where: { id },
          data: change,
          select: { id: true, email: true, role: true, active: true },
        });
        await tx.authSession.updateMany({
          where: { identityId: target.identityId },
          data: { revokedAt: new Date(), tokensCipher: '' },
        });
        await tx.adminAuditEvent.create({
          data: {
            action: change.role ? 'ADMIN_ROLE_CHANGED' : 'ADMIN_STATUS_CHANGED',
            actorId,
            targetId: id,
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  recoveryRequests() {
    return this.db.mfaRecoveryRequest.findMany({
      where: { executedAt: null, expiresAt: { gt: new Date() } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
  }
  async approveRecovery(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const actor = await tx.adminProfile.findUnique({ where: { id: actorId } });
      const request = await tx.mfaRecoveryRequest.findUnique({ where: { id } });
      if (
        !actor?.active ||
        actor.role !== 'OWNER' ||
        !request ||
        request.identityId === actor.identityId
      )
        throw new ForbiddenException('Aprovação exige outro OWNER ativo.');
      const changed = await tx.mfaRecoveryRequest.updateMany({
        where: { id, executedAt: null, approvedAt: null, expiresAt: { gt: new Date() } },
        data: { approvedById: actorId, approvedAt: new Date() },
      });
      if (!changed.count) throw new ConflictException('Pedido expirado ou já processado.');
      await tx.adminAuditEvent.create({
        data: { action: 'MFA_RECOVERY_APPROVED', actorId, targetId: id },
      });
      return {
        approved: true,
        message:
          'A execução exige verificação de identidade e operador no servidor; nenhum fator foi removido.',
      };
    });
  }
}
