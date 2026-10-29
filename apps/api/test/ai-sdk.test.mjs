import 'reflect-metadata';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
const generateContent = jest.fn(async () => ({ text: 'OK' }));
const constructor = jest.fn();
jest.unstable_mockModule('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(options) {
      constructor(options);
    }
    models = { generateContent };
  },
  FunctionCallingConfigMode: { NONE: 'NONE', AUTO: 'AUTO' },
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
}));
const { GeminiService } = await import('../dist/modules/ai/gemini.service.js');
const previous = { ...process.env };
afterEach(() => {
  process.env = { ...previous };
  jest.clearAllMocks();
});
describe('contrato do SDK (mock, zero rede)', () => {
  it('modelo do status é exatamente o modelo enviado ao SDK; retries e timeout limitados', async () => {
    Object.assign(process.env, {
      AI_ENABLED: 'true',
      GEMINI_API_KEY: 'test-only-key',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
    });
    const service = new GeminiService();
    await service.generate(
      [{ role: 'user', parts: [{ text: 'Fixture' }] }],
      [{ name: 'consult_clients' }],
      'Sistema',
      true,
    );
    expect(service.status().model).toBe('gemini-3.5-flash-lite');
    expect(constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        vertexai: false,
        httpOptions: { timeout: 25000, retryOptions: { attempts: 1 } },
      }),
    );
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: service.status().model,
        config: expect.objectContaining({
          maxOutputTokens: 2048,
          toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        }),
      }),
    );
  });
  it('sem chave não cria cliente nem executa chamadas', async () => {
    Object.assign(process.env, { AI_ENABLED: 'true', GEMINI_MODEL: 'gemini-3.5-flash-lite' });
    delete process.env.GEMINI_API_KEY;
    await expect(new GeminiService().generate([], [], 'Sistema')).rejects.toMatchObject({
      status: 503,
    });
    expect(generateContent).not.toHaveBeenCalled();
    expect(constructor).not.toHaveBeenCalled();
  });
});
