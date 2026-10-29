import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  status() {
    const enabled = process.env.AI_ENABLED === 'true',
      configured = !!process.env.GEMINI_API_KEY?.trim(),
      model = process.env.GEMINI_MODEL?.trim() || '',
      valid = /^gemini-[a-zA-Z0-9._-]{1,90}$/.test(model);
    return {
      enabled,
      configured,
      ready: enabled && configured && valid,
      model: valid ? model : null,
      reason: !enabled
        ? 'A VYMPAI está desativada.'
        : !configured
          ? 'A chave da VYMPAI ainda não foi configurada no servidor.'
          : !valid
            ? 'O modelo da VYMPAI configurado é inválido.'
            : null,
      readOnly: true,
      maxQuestionChars: 2000,
      maxToolCalls: 3,
      maxProviderCalls: 2,
    };
  }
  async generate(contents: Content[], tools: FunctionDeclaration[], system: string, final = false) {
    const state = this.status();
    if (!state.ready) throw new ServiceUnavailableException(state.reason!);
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!.trim(),
      vertexai: false,
      httpOptions: { timeout: 25000, retryOptions: { attempts: 1 } },
    });
    const response = await client.models.generateContent({
      model: state.model!,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: 2048,
        ...(state.model === 'gemini-3.5-flash-lite'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
          : {}),
        abortSignal: AbortSignal.timeout(27000),
        ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        toolConfig: {
          functionCallingConfig: {
            mode: final ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO,
          },
        },
      },
    });
    const finish = response.candidates?.[0]?.finishReason;
    this.logger.log({
      event: 'ai_provider_result',
      phase: final ? 'final' : 'initial',
      finish: typeof finish === 'string' && /^[A-Z_]{1,50}$/.test(finish) ? finish : null,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      thoughtTokens: response.usageMetadata?.thoughtsTokenCount ?? 0,
    });
    return response;
  }
}
