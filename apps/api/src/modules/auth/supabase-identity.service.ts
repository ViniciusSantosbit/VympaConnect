import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { requireAuthSettings } from './auth-config.js';
import { z } from 'zod';

const claimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iat: z.number(),
  nbf: z.number().optional(),
  aal: z.enum(['aal1', 'aal2']),
});
export type VerifiedIdentity = {
  id: string;
  email: string;
  aal: 'aal1' | 'aal2';
  sessionId: string;
};

@Injectable()
export class SupabaseIdentityService {
  private failure(error: unknown): never {
    const value = error as { status?: number; name?: string } | null;
    if (
      (value?.status && value.status >= 500) ||
      ['AuthRetryableFetchError', 'TimeoutError', 'AbortError'].includes(value?.name ?? '')
    )
      throw new ServiceUnavailableException('Serviço de autenticação indisponível.');
    throw new UnauthorizedException('Sessão inválida ou expirada.');
  }
  client(admin = false): SupabaseClient {
    const settings = requireAuthSettings();
    if (admin && !settings.secretKey)
      throw new ServiceUnavailableException('Operação administrativa Auth não configurada.');
    return createClient(settings.url, admin ? settings.secretKey : settings.publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });
  }

  async verify(client: SupabaseClient, token: string): Promise<VerifiedIdentity> {
    // getClaims verifica assinatura via JWKS; em projetos HS256 consulta o servidor Auth.
    const responseClaims = await client.auth
      .getClaims(token)
      .catch((error: unknown) => this.failure(error));
    const { data, error } = responseClaims;
    if (error) this.failure(error);
    const result = claimsSchema.safeParse(data?.claims);
    if (error || !result.success) throw new UnauthorizedException('Sessão inválida ou expirada.');
    const c = result.data;
    const settings = requireAuthSettings();
    const audiences = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (
      c.iss !== settings.url + '/auth/v1' ||
      !audiences.includes('authenticated') ||
      c.exp <= Date.now() / 1000 ||
      c.exp <= c.iat ||
      c.iat > Date.now() / 1000 + 30 ||
      (c.nbf !== undefined && c.nbf > Date.now() / 1000 + 30)
    )
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    // Consulta autoritativa adicional: usuário removido/bloqueado não herda acesso do JWT.
    const response = await client.auth.getUser(token);
    if (response.error) this.failure(response.error);
    const user = response.data.user;
    if (
      response.error ||
      user?.id !== c.sub ||
      !user.email ||
      !user.email_confirmed_at ||
      user.is_anonymous ||
      user.deleted_at ||
      (user.banned_until && Date.parse(user.banned_until) > Date.now())
    )
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    return { id: c.sub, email: user.email.toLowerCase(), aal: c.aal, sessionId: c.session_id };
  }

  async restore(tokens: { access_token: string; refresh_token: string }) {
    const client = this.client();
    const { data, error } = await client.auth.setSession(tokens);
    if (error) this.failure(error);
    if (!data.session) throw new UnauthorizedException('Sessão inválida ou expirada.');
    const identity = await this.verify(client, data.session.access_token);
    return { client, session: data.session, identity };
  }

  tokens(session: Session) {
    return { access_token: session.access_token, refresh_token: session.refresh_token };
  }
}
