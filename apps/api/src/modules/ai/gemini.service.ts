import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';
@Injectable()
export class GeminiService {
  status() {
    const enabled = process.env.AI_ENABLED === 'true',
      configured = !!process.env.GEMINI_API_KEY?.trim(),
      model = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest',
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
    return client.models.generateContent({
      model: state.model!,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: 2048,
        abortSignal: AbortSignal.timeout(27000),
        ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        toolConfig: {
          functionCallingConfig: {
            mode: final ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO,
          },
        },
      },
    });
  }
}
