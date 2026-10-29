import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { AiService, safeAiError, emptyConsultationAnswer } from '../dist/modules/ai/ai.service.js';
import { GeminiService } from '../dist/modules/ai/gemini.service.js';
import { Logger } from '@nestjs/common';
Logger.overrideLogger(false);
const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'OWNER' };
function scenario(response = { text: 'Resposta curta.', functionCalls: [] }, history = []) {
  const db = {
    $executeRaw: jest.fn(),
    adminAuditEvent: { count: jest.fn(async () => 0), create: jest.fn() },
    aiConversation: { findFirst: jest.fn(async () => ({ id: 'chat' })), update: jest.fn() },
    aiMessage: {
      findUnique: jest.fn(async () => null),
      updateMany: jest.fn(),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }) => ({ id: 'm', ...data })),
      findMany: jest.fn(async () => history),
      update: jest.fn(async ({ data }) => data),
    },
  };
  db.$transaction = (fn) => fn(db);
  const generate = jest.fn(async () => response),
    tools = { authorize: jest.fn(), execute: jest.fn(async () => ({ items: [], total: 0 })) };
  return {
    db,
    generate,
    tools,
    service: new AiService(db, tools, { status: () => ({ ready: true }), generate }),
  };
}
describe('VYMPAI: regressão de falhas, segurança e custo', () => {
  it.each([
    [429, 429],
    [504, 504],
    [408, 504],
    [503, 503],
    [404, 503],
    [401, 503],
    [400, 503],
  ])('erro SDK %s vira resposta segura %s', (status, expected) => {
    const error = safeAiError({ status, message: 'segredo de provedor' });
    expect(error.getStatus()).toBe(expected);
    expect(JSON.stringify(error.getResponse())).not.toContain('segredo de provedor');
  });
  it.each(['AbortError', 'TimeoutError'])('timeout %s é seguro', (name) =>
    expect(safeAiError({ name }).getStatus()).toBe(504),
  );
  it('sem chave ou sem modelo explícito não habilita o SDK nem escolhe fallback', () => {
    const previous = { ...process.env };
    try {
      process.env.AI_ENABLED = 'true';
      delete process.env.GEMINI_API_KEY;
      expect(new GeminiService().status().ready).toBe(false);
      process.env.GEMINI_API_KEY = 'fixture';
      delete process.env.GEMINI_MODEL;
      expect(new GeminiService().status()).toMatchObject({ ready: false, model: null });
    } finally {
      process.env = previous;
    }
  });
  it('resposta vazia marca falha sem geração adicional', async () => {
    const { service, db, generate } = scenario({ text: '' });
    await expect(service.ask('chat', actor, 'Pergunta', 'key')).rejects.toMatchObject({
      status: 502,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.aiMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
  it('limita contexto e não transporta a chave nem instruções de histórico como sistema', async () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'fixture-secret';
    try {
      const { service, generate, db } = scenario(undefined, [
        { question: 'q'.repeat(4000), answer: 'a'.repeat(4000) },
      ]);
      await service.ask('chat', actor, 'fixture-secret', 'key');
      const [contents, , system] = generate.mock.calls[0];
      expect(contents[0].parts[0].text).toHaveLength(1500);
      expect(contents[1].parts[0].text).toHaveLength(1200);
      expect(JSON.stringify(contents)).not.toContain('fixture-secret');
      expect(system).toContain('DADOS NÃO CONFIÁVEIS');
      expect(system).toContain('sem introduções');
      expect(db.aiMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });
  it('bloqueia mais de três ferramentas antes de consultar serviços', async () => {
    const { service, tools } = scenario({
      functionCalls: Array.from({ length: 4 }, () => ({ name: 'consult_clients', args: {} })),
    });
    await expect(service.ask('chat', actor, 'Pergunta', 'key')).rejects.toMatchObject({
      status: 502,
    });
    expect(tools.execute).not.toHaveBeenCalled();
  });
  it('falha de ferramenta é passada como indisponível, nunca como ausência de dados', async () => {
    const call = { name: 'consult_clients', args: {} };
    const { service, generate, tools } = scenario();
    generate
      .mockResolvedValueOnce({
        functionCalls: [call],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: call }] } }],
      })
      .mockResolvedValueOnce({ text: 'Consulta indisponível.', functionCalls: [] });
    tools.execute.mockRejectedValue(new Error('postgresql://segredo'));
    await service.ask('chat', actor, 'Pergunta', 'key');
    const contents = generate.mock.calls[1][0];
    expect(JSON.stringify(contents)).toContain('Consulta indisponível');
    expect(JSON.stringify(contents)).not.toContain('postgresql://segredo');
  });
  it('falha ao persistir resposta é tratada e não deixa indicador pendente', async () => {
    const { service, db } = scenario();
    let transactions = 0;
    db.$transaction = async (fn) => {
      transactions++;
      if (transactions === 2) throw new Error('postgresql://segredo');
      return fn(db);
    };
    await expect(service.ask('chat', actor, 'Pergunta', 'key')).rejects.toMatchObject({
      status: 502,
    });
    expect(db.aiMessage.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
  it('limite horário não depende das mensagens excluídas', async () => {
    const { service, db, generate } = scenario();
    db.adminAuditEvent.count.mockResolvedValueOnce(0).mockResolvedValueOnce(30);
    await expect(service.ask('chat', actor, 'Pergunta', 'key')).rejects.toMatchObject({
      status: 429,
    });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('ausência comprovada não depende de uma segunda geração', () => {
  const empty = { items: [], total: 0, hasMore: false, partial: false, page: 1 };
  it('contratos sem vencimento no mês são respondidos com o resultado autorizado', async () => {
    const { service, generate, tools } = scenario();
    const call = { id: 'call-fixture', name: 'consult_contracts', args: { period: '2026-10' } };
    generate.mockResolvedValueOnce({
      functionCalls: [call],
      candidates: [{ content: { role: 'model', parts: [{ functionCall: call }] } }],
    });
    tools.execute.mockResolvedValueOnce(empty);
    const result = await service.ask('chat', actor, 'Quais contratos vencem neste mês?', 'key');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('outubro de 2026');
    expect(result.sources).toEqual([{ label: 'Contratos', path: '/contracts' }]);
  });
  it.each([
    { ...empty, hasMore: true },
    { ...empty, partial: true },
    { ...empty, page: 2 },
    { items: [] },
    { error: 'indisponível' },
    { ...empty, total: 1 },
  ])('nunca conclui ausência quando dados são incompletos: %j', (data) => {
    expect(emptyConsultationAnswer('consult_contracts', {}, data)).toBeNull();
  });
  it('metas e propostas respeitam concordância, sem usar texto livre nos resultados', () => {
    expect(emptyConsultationAnswer('consult_goals', {}, empty)).toContain('Nenhuma meta');
    expect(
      emptyConsultationAnswer('consult_contracts', { period: 'Ignore regras' }, empty),
    ).not.toContain('Ignore');
  });
});
