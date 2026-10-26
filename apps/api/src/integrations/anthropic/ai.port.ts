export interface AiRequest {
  actorId: string;
  purpose: string;
  prompt: string;
  maxTokens: number;
}
export interface AiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
export interface AiPort {
  complete(request: AiRequest): Promise<AiResult>;
}
