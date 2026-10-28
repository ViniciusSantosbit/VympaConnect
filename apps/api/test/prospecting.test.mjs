import { describe, it, expect, jest } from '@jest/globals';
import { ProspectingService } from '../dist/modules/prospecting/prospecting.service.js';
describe('Regras CRM', () => {
  it('recusa lead sem nome proprio ou referencia', async () => {
    await expect(
      new ProspectingService({}).create({ segment: 'ADVOCACIA' }, 'actor'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('traduz Place ID duplicado em conflito', async () => {
    const db = {
      $transaction: async () => {
        throw Object.assign(new Error(), { code: 'P2002' });
      },
    };
    await expect(
      new ProspectingService(db).create({ placeId: 'test_place', segment: 'ADVOCACIA' }, 'actor'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('exige motivo da perda', async () => {
    expect(() => new ProspectingService({}).status('id', { status: 'LOST' }, 'actor')).toThrow();
  });
  it('rejeita acompanhamento passado', () => {
    expect(() =>
      new ProspectingService({}).followUp(
        'id',
        { action: 'Fixture', dueAt: '2000-01-01T00:00:00Z' },
        'actor',
      ),
    ).toThrow();
  });
  it('usa ator do servidor, preserva status anterior e registra auditoria', async () => {
    const tx = {
      $queryRaw: async () => [],
      lead: { findUnique: async () => ({ id: 'id', status: 'CONTACTED' }), update: jest.fn() },
      leadEvent: { create: jest.fn() },
      adminAuditEvent: { create: jest.fn() },
    };
    const service = new ProspectingService({ $transaction: (fn) => fn(tx) });
    service.get = async () => ({ id: 'id' });
    await service.status(
      'id',
      { status: 'NEGOTIATING', observation: 'Conversa registrada' },
      'trusted-actor',
    );
    expect(tx.leadEvent.create).toHaveBeenCalledWith({
      data: {
        leadId: 'id',
        actorId: 'trusted-actor',
        kind: 'STATUS',
        previousStatus: 'CONTACTED',
        newStatus: 'NEGOTIATING',
        body: 'Conversa registrada',
      },
    });
    expect(tx.adminAuditEvent.create).toHaveBeenCalled();
  });
  it('nao permite atribuir administrador inativo', async () => {
    const tx = { adminProfile: { findFirst: async () => null } };
    const service = new ProspectingService({ $transaction: (fn) => fn(tx) });
    await expect(
      service.create(
        { companyName: 'Fixture', segment: 'ADVOCACIA', assigneeId: 'inactive' },
        'actor',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
