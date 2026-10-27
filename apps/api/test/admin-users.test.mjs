import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AdminUsersService } from '../dist/modules/admin-users/admin-users.service.js';
import { AuthService } from '../dist/modules/auth/auth.service.js';

let db, service;
const owner = { id: 'owner', identityId: 'owner-identity', role: 'OWNER', active: true };
const target = { id: 'admin', identityId: 'admin-identity', role: 'ADMIN', active: true };
beforeEach(() => {
  db = {
    $queryRaw: jest.fn(),
    adminProfile: {
      findUnique: jest.fn(async ({ where }) => (where.id === owner.id ? owner : target)),
      count: jest.fn(async () => 2),
      update: jest.fn(async ({ data }) => ({ ...target, ...data })),
    },
    authSession: { updateMany: jest.fn(async () => ({ count: 1 })) },
    adminAuditEvent: { create: jest.fn() },
    mfaRecoveryRequest: {
      findUnique: jest.fn(async () => ({ id: 'request', identityId: target.identityId })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  db.$transaction = (callback) => callback(db);
  service = new AdminUsersService(db, {});
});
describe('Operações sensíveis OWNER', () => {
  it('proíbe alterar o próprio papel ou desativar a própria conta', async () => {
    await expect(service.change(owner.id, owner.id, { role: 'ADMIN' })).rejects.toThrow();
    await expect(service.change(owner.id, owner.id, { active: false })).rejects.toThrow();
    expect(db.adminProfile.update).not.toHaveBeenCalled();
  });
  it('ADMIN não altera papéis mesmo invocando o serviço diretamente', async () => {
    await expect(service.change(target.id, target.id, { role: 'OWNER' })).rejects.toThrow();
    expect(db.adminProfile.update).not.toHaveBeenCalled();
  });
  it('desativação por OWNER revoga sessões e registra auditoria na transação', async () => {
    await service.change(owner.id, target.id, { active: false });
    expect(db.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identityId: target.identityId },
        data: expect.objectContaining({ tokensCipher: '' }),
      }),
    );
    expect(db.adminAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ADMIN_STATUS_CHANGED', actorId: owner.id }),
      }),
    );
  });
  it('bloqueia alteração manual de conta em recuperação', async () => {
    db.adminProfile.findUnique.mockImplementation(async ({ where }) =>
      where.id === owner.id ? owner : { ...target, recoveryRequired: true },
    );
    await expect(service.change(owner.id, target.id, { active: true })).rejects.toThrow();
  });
  it('não permite que o solicitante aprove sua própria recuperação', async () => {
    db.mfaRecoveryRequest.findUnique.mockResolvedValue({ identityId: owner.identityId });
    await expect(service.approveRecovery(owner.id, 'request')).rejects.toThrow();
    expect(db.mfaRecoveryRequest.updateMany).not.toHaveBeenCalled();
  });
  it('aprovação não remove nenhum fator e pedido expirado não é aprovado', async () => {
    await expect(service.approveRecovery(owner.id, 'request')).resolves.toMatchObject({
      approved: true,
    });
    db.mfaRecoveryRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approveRecovery(owner.id, 'expired-request')).rejects.toThrow();
  });
  it('em HTTPS emite cookie Secure, HttpOnly, Strict e sem Domain', () => {
    const previous = process.env.AUTH_WEB_ORIGIN;
    process.env.AUTH_WEB_ORIGIN = 'https://127.0.0.1:5173';
    try {
      const response = { cookie: jest.fn() };
      new AuthService(db, {}).cookie(response, 'session', 'test-only-handle');
      expect(response.cookie).toHaveBeenCalledWith(
        '__Host-vympa_session',
        'test-only-handle',
        expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' }),
      );
      expect(response.cookie.mock.calls[0][2].domain).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.AUTH_WEB_ORIGIN;
      else process.env.AUTH_WEB_ORIGIN = previous;
    }
  });
});
