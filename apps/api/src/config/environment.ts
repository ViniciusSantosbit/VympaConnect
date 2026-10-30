import { z } from 'zod';
import { assertDatabaseUrl } from './database-environment.js';
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
  const auth = authSettings(input);
  if (result.data.NODE_ENV === 'production') {
    if (auth.mode !== 'production' || input.VYMPA_DATABASE_TARGET !== 'production')
      throw new Error('Execução não autorizada: configuração produtiva explícita obrigatória.');
    assertDatabaseUrl(result.data.DATABASE_URL, 'production');
    if (result.data.CORS_ORIGINS.length !== 1 || result.data.CORS_ORIGINS[0] !== auth.origin)
      throw new Error('CORS produtivo deve corresponder à origem HTTPS do painel.');
    if (['debug', 'trace'].includes(result.data.LOG_LEVEL))
      throw new Error('Log detalhado não autorizado em produção.');
    if (input.AUTH_ENABLE_BREAK_GLASS === 'true')
      throw new Error('Break-glass não pode ser habilitado no runtime de produção.');
  }
  return result.data;
}
