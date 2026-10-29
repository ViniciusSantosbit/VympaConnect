import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  cnpjValue,
  validDate,
  effectiveMonthly,
  contractPublic,
} from '../dist/modules/clients/commercial-support.js';
import {
  ClientDto,
  ContractDto,
  UpdateContractDto,
  DocumentDto,
} from '../dist/modules/clients/commercial.dto.js';
import { ClientsService, clientTransitions } from '../dist/modules/clients/clients.service.js';
import {
  ContractsService,
  contractTransitions,
} from '../dist/modules/contracts/contracts.service.js';
import { ContractDocumentsService } from '../dist/modules/contracts/contract-documents.service.js';
const actor = '11111111-1111-4111-8111-111111111111';
describe('Clientes: dados empresariais e privacidade', () => {
  it('valida também o exemplo alfanumérico oficial da Receita Federal', () =>
    expect(cnpjValue('12.ABC.345/01DE-35')).toBe('12ABC34501DE35'));
  it.each(['04.252.011/0001-10', '04252011000110'])('normaliza e valida CNPJ %s', (n) =>
    expect(cnpjValue(n)).toBe('04252011000110'),
  );
  it.each(['00000000000000', '11111111111111', '04252011000111', 'abc', '123'])(
    'recusa CNPJ %s',
    (n) => expect(() => cnpjValue(n)).toThrow(),
  );
  it('permite CNPJ desconhecido', () => expect(cnpjValue('')).toBeNull());
  it('exige somente os dados mínimos da empresa', async () => {
    expect(
      await validate(
        plainToInstance(ClientDto, {
          companyName: 'Empresa teste',
          segment: 'ADVOCACIA',
          responsibleId: actor,
        }),
      ),
    ).toHaveLength(0);
    expect((await validate(plainToInstance(ClientDto, {}))).length).toBeGreaterThan(0);
  });
  it('não aceita nomes em branco nem URLs executáveis', async () => {
    expect(
      (
        await validate(
          plainToInstance(ClientDto, {
            companyName: '   ',
            segment: 'ADVOCACIA',
            responsibleId: actor,
            website: 'javascript:alert(1)',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('não ativa o relacionamento a partir de uma proposta', () =>
    expect(clientTransitions.PROSPECT).not.toContain('ACTIVE'));
  it('ADMIN não acessa cliente de outro responsável', async () => {
    const s = new ClientsService({
      client: { findUnique: async () => ({ id: 'x', responsibleId: 'other' }) },
    });
    await expect(s.require('x', actor, 'ADMIN')).rejects.toMatchObject({ status: 403 });
  });
  it('transições de cliente exigem OWNER também no serviço', async () =>
    await expect(new ClientsService({}).state('x', {}, actor, 'ADMIN')).rejects.toMatchObject({
      status: 403,
    }));
});
describe('Contratos: ciclo de vida, dinheiro exato e acesso', () => {
  it.each(['2026-02-30', '2026-13-01', 'data'])('recusa data impossível %s', (d) =>
    expect(() => validDate(d)).toThrow(),
  );
  it('preserva a mensalidade original e aplica aditivos por vigência', () => {
    const c = {
      monthlyCents: 10001,
      amendments: [{ effectiveOn: validDate('2026-11-01'), monthlyCents: 12345 }],
    };
    expect(effectiveMonthly(c, '2026-10-31')).toBe(10001);
    expect(effectiveMonthly(c, '2026-11-01')).toBe(12345);
    expect(c.monthlyCents).toBe(10001);
  });
  it('ADMIN não recebe valores, snapshots ou auditoria privada', () => {
    const value = contractPublic(
      {
        id: 'safe',
        monthlyCents: 100,
        setupCents: 200,
        commercialTerms: 'privado',
        proposalSnapshot: { result: 100 },
        amendments: [{ monthlyCents: 100 }],
        history: [{ after: { monthlyCents: 100 } }],
      },
      'ADMIN',
    );
    expect(value).toEqual({ id: 'safe' });
  });
  it('exige assinatura antes da ativação e não reabre encerramentos', () => {
    expect(contractTransitions.DRAFT).not.toContain('ACTIVE');
    expect(contractTransitions.PENDING_SIGNATURE).toContain('SIGNED');
    expect(contractTransitions.TERMINATED).toEqual([]);
  });
  it.each(['state', 'amend', 'renew'])(
    'ADMIN não executa %s',
    async (method) =>
      await expect(
        new ContractsService({}, {})[method]('id', {}, actor, 'ADMIN'),
      ).rejects.toMatchObject({ status: 403 }),
  );
  it('não aceita centavos fracionários ou negativos', async () => {
    const base = {
      number: 'C-01',
      requestKey: 'request-01',
      clientId: actor,
      responsibleId: actor,
      title: 'Teste',
      monthlyCents: 1.1,
      setupCents: -1,
    };
    const errors = await validate(plainToInstance(ContractDto, base));
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['monthlyCents', 'setupCents']),
    );
  });
  it('não permite null para apagar o versionamento ou campos obrigatórios', async () => {
    const errors = await validate(plainToInstance(UpdateContractDto, { version: 1, title: null }));
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });
  it('não marca como assinado sem evidência', async () => {
    const tx = {
      $executeRaw: async () => 0,
      contract: {
        findUnique: async () => ({
          id: 'x',
          version: 1,
          status: 'PENDING_SIGNATURE',
          client: { responsibleId: actor },
        }),
      },
    };
    const db = { $transaction: (fn) => fn(tx) };
    await expect(
      new ContractsService(db, {}).state(
        'x',
        { version: 1, status: 'SIGNED', reason: 'Teste de evidência' },
        actor,
        'OWNER',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejeita criação administrativa com valores oficiais antes de gravar', async () => {
    const tx = {
      $executeRaw: async () => 0,
      contract: { findUnique: async () => null, create: jest.fn() },
      adminProfile: { findFirst: async () => ({ id: actor }) },
    };
    await expect(
      new ContractsService({ $transaction: (fn) => fn(tx) }, { require: async () => ({}) }).create(
        { clientId: actor, responsibleId: actor, monthlyCents: 100 },
        actor,
        'ADMIN',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.contract.create).not.toHaveBeenCalled();
  });
});
describe('Documentos privados', () => {
  it.each(['../contrato.pdf', 'a\\contrato.docx', 'a\u0000.pdf'])(
    'recusa traversal em %s',
    async (name) =>
      expect(
        (await validate(plainToInstance(DocumentDto, { name, kind: 'PDF' }))).length,
      ).toBeGreaterThan(0),
  );
  it('não aceita executável como formato', async () =>
    expect(
      (await validate(plainToInstance(DocumentDto, { name: 'programa.exe', kind: 'EXE' }))).length,
    ).toBeGreaterThan(0));
  it('upload continua bloqueado mesmo para OWNER', async () =>
    await expect(
      new ContractDocumentsService({}, { require: async () => ({}) }).blocked('x', actor, 'OWNER'),
    ).rejects.toMatchObject({ status: 503 }));
  it('valida autorização antes de indicar armazenamento', async () => {
    const require = jest.fn(async () => {
      throw Object.assign(new Error('sem acesso'), { status: 403 });
    });
    await expect(
      new ContractDocumentsService({}, { require }).blocked('x', actor, 'ADMIN'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
