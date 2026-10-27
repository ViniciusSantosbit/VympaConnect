import { z } from 'zod';
import { authSettings } from '../modules/auth/auth-config.js';
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z
    .url()
    .refine(
      (url) => ['postgres:', 'postgresql:'].includes(new URL(url).protocol),
      'URL PostgreSQL obrigatória',
    ),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .refine(
      (origins) =>
        origins.length > 0 &&
        origins.every((origin) => {
          try {
            const url = new URL(origin);
            return ['http:', 'https:'].includes(url.protocol) && url.origin === origin;
          } catch {
            return false;
          }
        }),
      'Origens HTTP explícitas obrigatórias',
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type Environment = z.infer<typeof environmentSchema>;
export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      'Configuração de ambiente inválida: ' +
        result.error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).join('; '),
    );
  if (result.data.NODE_ENV === 'production')
    throw new Error(
      'Execução não autorizada para produção: concluir validação da infraestrutura Auth isolada, políticas e recuperação operacional.',
    );
  authSettings(input);
  return result.data;
}
