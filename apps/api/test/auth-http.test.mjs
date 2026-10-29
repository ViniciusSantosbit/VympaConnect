import 'reflect-metadata';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/config/configure-app.js';
import { GeminiService } from '../dist/modules/ai/gemini.service.js';
import { DatabaseService } from '../dist/database/database.service.js';
import { SupabaseIdentityService } from '../dist/modules/auth/supabase-identity.service.js';

const identityId = '11111111-1111-4111-8111-111111111111';
const profileId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
let app, agent, db, provider, identity, profile, csrf, sessions, invitation, previous;
function matches(row, where) {
  if (where.id && (typeof where.id === 'string' ? row.id !== where.id : row.id === where.id.not))
    return false;
  if (where.identityId && row.identityId !== where.identityId) return false;
  if (where.revokedAt === null && row.revokedAt) return false;
  return true;
}
beforeEach(async () => {
  previous = { ...process.env };
  process.env.AUTH_ENVIRONMENT = 'local';
  process.env.AUTH_WEB_ORIGIN = 'http://127.0.0.1:5173';
  process.env.AUTH_SESSION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.SUPABASE_AUTH_PUBLISHABLE_KEY = 'test-key';
  process.env.SUPABASE_AUTH_URL = 'http://127.0.0.1:54321';
  sessions = new Map();
  invitation = null;
  identity = {
    id: identityId,
    email: 'admin@example.invalid',
    aal: 'aal2',
    sessionId: '22222222-2222-4222-8222-222222222222',
  };
  profile = {
    id: profileId,
    identityId,
    email: identity.email,
    role: 'OWNER',
    active: true,
    recoveryRequired: false,
  };
  const client = {
    auth: {
      signInWithPassword: jest.fn(async ({ password }) =>
        password === 'valid-test-password'
          ? {
              data: {
                session: { access_token: 'test-only-access', refresh_token: 'test-only-refresh' },
              },
              error: null,
            }
          : { data: {}, error: { status: 400 } },
      ),
      signOut: jest.fn(async () => ({ error: null })),
      mfa: {
        listFactors: jest.fn(async () => ({
          data: { totp: [{ id: ownerId, status: 'verified' }], all: [] },
          error: null,
        })),
      },
    },
  };
  provider = {
    client: jest.fn(() => client),
    verify: jest.fn(async () => identity),
    restore: jest.fn(async () => ({
      client,
      identity,
      session: { access_token: 'test-only-access', refresh_token: 'test-only-refresh' },
    })),
    tokens: (value) => ({ access_token: value.access_token, refresh_token: value.refresh_token }),
  };
  db = {
    goal: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
    },
    client: { count: jest.fn(async () => 0), findUnique: jest.fn(async () => null) },
    contract: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    financialOpeningBalance: { findUnique: jest.fn(async () => null) },
    financialTransaction: { groupBy: jest.fn(async () => []) },
    lead: { groupBy: jest.fn(async () => []) },
    leadEvent: { findMany: jest.fn(async () => []) },
    placesUsage: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => []),
    adminProfile: {
      findUnique: jest.fn(async ({ where }) =>
        where.id === ownerId ? { id: ownerId, role: 'OWNER', active: true } : profile,
      ),
      create: jest.fn(async ({ data }) => {
        profile = { id: profileId, active: true, ...data };
        return profile;
      }),
      count: jest.fn(async () => 1),
      update: jest.fn(),
      findMany: jest.fn(async () => [profile]),
    },
    adminInvitation: {
      findFirst: jest.fn(async () =>
        invitation &&
        !invitation.revokedAt &&
        !invitation.acceptedAt &&
        invitation.expiresAt > new Date()
          ? invitation
          : null,
      ),
      updateMany: jest.fn(async () => {
        if (!invitation || invitation.acceptedAt || invitation.revokedAt) return { count: 0 };
        invitation.acceptedAt = new Date();
        return { count: 1 };
      }),
    },
    adminAuditEvent: { create: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
    authSession: {
      create: jest.fn(async ({ data }) => {
        const value = { revokedAt: null, ...data };
        sessions.set(data.id, value);
        return value;
      }),
      findUnique: jest.fn(async ({ where }) => sessions.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }) => Object.assign(sessions.get(where.id), data)),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const value of sessions.values())
          if (matches(value, where)) {
            Object.assign(value, data);
            count++;
          }
        return { count };
      }),
    },
  };
  db.$transaction = jest.fn(async (value) =>
    typeof value === 'function' ? value(db) : Promise.all(value),
  );
  db.$executeRaw = jest.fn(async () => 0);
  db.adminAuditEvent.count = jest.fn(async () => 0);
  const conversations = new Map(),
    messages = new Map();
  db.aiConversation = {
    create: jest.fn(async ({ data }) => {
      const c = { ...data, id: profileId, updatedAt: new Date() };
      conversations.set(c.id, c);
      return c;
    }),
    findFirst: jest.fn(async ({ where }) => {
      const c = conversations.get(where.id);
      return c?.profileId === where.profileId && c?.role === where.role ? c : null;
    }),
    findMany: jest.fn(async () =>
      [...conversations.values()].filter(
        (c) => c.profileId === profile.id && c.role === profile.role,
      ),
    ),
    count: jest.fn(async () => conversations.size),
    update: jest.fn(async () => ({})),
    delete: jest.fn(async ({ where }) => conversations.delete(where.id)),
  };
  db.aiMessage = {
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => [...messages.values()]),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }) => {
      const m = { ...data, id: ownerId, status: 'PENDING', createdAt: new Date() };
      messages.set(m.id, m);
      return m;
    }),
    update: jest.fn(async ({ where, data }) => Object.assign(messages.get(where.id), data)),
    updateMany: jest.fn(async () => ({ count: 0 })),
    deleteMany: jest.fn(async () => {
      messages.clear();
      return { count: 1 };
    }),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GeminiService)
    .useValue({
      status: () => ({ ready: true, model: 'gemini-3.5-flash-lite' }),
      generate: jest.fn(async () => ({ text: 'Resposta de fixture.', functionCalls: [] })),
    })
    .overrideProvider(DatabaseService)
    .useValue(db)
    .overrideProvider(SupabaseIdentityService)
    .useValue(provider)
    .compile();
  app = module.createNestApplication();
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  agent = request.agent(app.getHttpServer());
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  csrf = response.body.csrfToken;
});
afterEach(async () => {
  await app?.close();
  process.env = previous;
});
async function login() {
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://127.0.0.1:5173')
    .set('X-CSRF-Token', csrf)
    .send({ email: identity.email, password: 'valid-test-password' })
    .expect(201);
  csrf = response.body.csrfToken;
  return response;
}
describe('Integração HTTP de autenticação (banco e transporte Auth simulados)', () => {
  it('protege o resumo do dashboard com sessão, MFA e perfil ativo', async () => {
    await agent.get('/api/v1/dashboard/summary').expect(401);
    identity.aal = 'aal1';
    await login();
    await agent.get('/api/v1/dashboard/summary').expect(403);
    identity.aal = 'aal2';
    const response = await agent.get('/api/v1/dashboard/summary').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.metrics.leads).toBe(0);
    expect(response.body.metrics.closedContracts).toBe(0);
    expect(response.body.businessStatus).toBe('prospecting_ready');
    profile.active = false;
    await agent.get('/api/v1/dashboard/summary').expect(403);
  });
  it('permite resumo para ADMIN com MFA e restringe atividades à própria conta', async () => {
    profile.role = 'ADMIN';
    await login();
    await agent.get('/api/v1/dashboard/summary').expect(200);
    expect(db.adminAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ actorId: profileId }, { targetId: identityId }, { targetId: profileId }],
        }),
        take: 5,
        select: { id: true, action: true, createdAt: true },
      }),
    );
  });
  it('mantém health público e recusa cookie ou bearer inválidos', async () => {
    await agent.get('/api/v1/health').expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
    await agent
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-test-token')
      .expect(401);
  });
  it('login válido emite cookie HttpOnly e não retorna tokens Supabase', async () => {
    const response = await login();
    expect(response.headers['set-cookie'].join(';')).toContain('HttpOnly');
    expect(response.headers['set-cookie'].join(';')).toContain('SameSite=Strict');
    expect(JSON.stringify(response.body)).not.toContain('test-only-access');
    await agent.get('/api/v1/auth/me').expect(200);
  });
  it('rejeita senha inválida sem emitir sessão', async () => {
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ email: identity.email, password: 'wrong' })
      .expect(401);
    expect(sessions.size).toBe(0);
  });
  it('classifica provedor de e-mail desabilitado como indisponibilidade sem expor detalhes', async () => {
    provider.client().auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { status: 422, code: 'email_provider_disabled', message: 'sensitive-provider-detail' },
    });
    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ email: identity.email, password: 'valid-test-password' })
      .expect(503);
    expect(JSON.stringify(response.body)).not.toMatch(
      /email_provider_disabled|sensitive-provider-detail/,
    );
    expect(sessions.size).toBe(0);
    expect(provider.verify).not.toHaveBeenCalled();
  });
  it('permite primeiro login sem fator MFA e exige cadastro antes do painel', async () => {
    identity.aal = 'aal1';
    provider
      .client()
      .auth.mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    await login();
    const response = await agent.get('/api/v1/auth/session').expect(200);
    expect(response.body.state).toBe('mfa_enroll');
    await agent.get('/api/v1/auth/me').expect(403);
  });
  it('rejeita login sem perfil administrativo ou convite', async () => {
    profile = null;
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ email: identity.email, password: 'valid-test-password' })
      .expect(401);
  });
  it('rejeita perfil desativado e revalida o perfil a cada chamada', async () => {
    await login();
    profile.active = false;
    await agent.get('/api/v1/auth/me').expect(403);
  });
  it('recusa MFA incompleto no backend e permite apenas onboarding', async () => {
    identity.aal = 'aal1';
    await login();
    await agent.get('/api/v1/auth/me').expect(403);
    const state = await agent.get('/api/v1/auth/session').expect(200);
    expect(state.body.state).toBe('mfa_verify');
  });
  it('ADMIN com MFA não acessa recursos OWNER nem promove a si mesmo', async () => {
    profile.role = 'ADMIN';
    await login();
    await agent.get('/api/v1/auth/me').expect(200);
    await agent.get('/api/v1/admin/users').expect(403);
    await agent
      .patch('/api/v1/admin/users/' + profileId + '/role')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ role: 'OWNER' })
      .expect(403);
  });
  it('recusa injeção de papel no login e no convite', async () => {
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ email: identity.email, password: 'valid-test-password', role: 'OWNER' })
      .expect(400);
    await login();
    await agent
      .post('/api/v1/admin/invitations')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'invite@example.invalid', role: 'OWNER' })
      .expect(400);
  });
  it('rejeita sessão expirada e token rejeitado pelo provedor', async () => {
    await login();
    provider.restore.mockRejectedValueOnce(new UnauthorizedException());
    await agent.get('/api/v1/auth/me').expect(401);
    for (const session of sessions.values()) session.expiresAt = new Date(0);
    await agent.get('/api/v1/auth/me').expect(401);
  });
  it('encerra sessão e impede reuso do cookie capturado', async () => {
    const response = await login();
    const captured = response.headers['set-cookie']
      .find((cookie) => cookie.startsWith('vympa_session='))
      .split(';')[0];
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(201);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', captured).expect(401);
    expect(
      [...sessions.values()].every((value) => value.revokedAt && value.tokensCipher === ''),
    ).toBe(true);
  });
  it('recusa CSRF ausente, origem externa e token de outra sessão', async () => {
    await agent
      .post('/api/v1/auth/login')
      .send({ email: identity.email, password: 'valid-test-password' })
      .expect(403);
    await login();
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://other.example')
      .set('X-CSRF-Token', csrf)
      .expect(403);
    await agent
      .post('/api/v1/auth/mfa/enroll')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', 'a'.repeat(64))
      .expect(403);
  });
  it('renova CSRF no reload sem quebrar a sessão existente', async () => {
    await login();
    const response = await agent.get('/api/v1/auth/csrf').expect(200);
    csrf = response.body.csrfToken;
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(201);
  });
  it.each(['expired', 'revoked'])('recusa convite %s após login', async (state) => {
    await login();
    profile = null;
    invitation = {
      id: ownerId,
      role: 'ADMIN',
      identityId,
      email: identity.email,
      expiresAt: state === 'expired' ? new Date(0) : new Date(Date.now() + 60000),
      revokedAt: state === 'revoked' ? new Date() : null,
      acceptedAt: null,
    };
    await agent
      .post('/api/v1/auth/invitation/accept')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(403);
  });
  it('aceita convite uma única vez com MFA, usando papel persistido', async () => {
    await login();
    profile = null;
    invitation = {
      id: ownerId,
      role: 'ADMIN',
      identityId,
      email: identity.email,
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
      acceptedAt: null,
    };
    await agent
      .post('/api/v1/auth/invitation/accept')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(201);
    expect(profile.role).toBe('ADMIN');
    await agent
      .post('/api/v1/auth/invitation/accept')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(403);
  });
});

describe('Metas: sessão, MFA, CSRF e dados financeiros', () => {
  const paths = [
    '/goals',
    '/goals/summary',
    '/goals/definitions',
    '/goals/analytics',
    '/goals/team',
    '/goals/' + profileId,
    '/goals/' + profileId + '/progress',
    '/goals/' + profileId + '/history',
  ];
  it('exige sessão e MFA em todas as leituras', async () => {
    for (const path of paths) await agent.get('/api/v1' + path).expect(401);
    identity.aal = 'aal1';
    await login();
    for (const path of paths) await agent.get('/api/v1' + path).expect(403);
  });
  it('não permite CSRF ausente nas mutações', async () => {
    await login();
    for (const path of [
      '/goals',
      '/goals/' + profileId + '/comments',
      '/goals/' + profileId + '/manual-updates',
      '/goals/' + profileId + '/snapshots',
    ])
      await agent
        .post('/api/v1' + path)
        .send({})
        .expect(403);
  });
  it('ADMIN não configura metas e não recebe indicadores financeiros', async () => {
    profile.role = 'ADMIN';
    await login();
    await agent.get('/api/v1/goals/analytics').expect(403);
    const definitions = await agent.get('/api/v1/goals/definitions').expect(200);
    expect(definitions.body.every((d) => !d.financial)).toBe(true);
    await agent
      .post('/api/v1/goals')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(403);
    await agent
      .patch('/api/v1/goals/' + profileId)
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(403);
    await agent.get('/api/v1/goals/' + profileId).expect(404);
    const summary = await agent.get('/api/v1/goals/summary').expect(200);
    expect(summary.body.financialInProgress).toBeNull();
  });
  it('rejeita realização ou role injetadas e alvo monetário em ponto flutuante', async () => {
    await login();
    await agent
      .post('/api/v1/goals')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({
        title: 'Meta manipulada',
        target: 10.25,
        realized: 999,
        progress: 100,
        role: 'OWNER',
      })
      .expect(400);
    await agent.get('/api/v1/goals?status=INVALID').expect(400);
    await agent.get('/api/v1/goals/not-an-id').expect(400);
  });
});
describe('Clientes e contratos: sessão, MFA, CSRF e RBAC', () => {
  const paths = [
    '/clients',
    '/clients/' + profileId,
    '/clients/' + profileId + '/activity',
    '/contracts',
    '/contracts/summary',
    '/contracts/expiring',
    '/contracts/' + profileId,
    '/contracts/' + profileId + '/documents',
    '/contracts/' + profileId + '/documents/' + ownerId + '/download',
  ];
  it('exige sessão e MFA em todas as leituras novas', async () => {
    for (const path of paths) await agent.get('/api/v1' + path).expect(401);
    identity.aal = 'aal1';
    await login();
    for (const path of paths) await agent.get('/api/v1' + path).expect(403);
  });
  it('exige CSRF para mutações', async () => {
    await login();
    for (const path of [
      '/clients',
      '/contracts',
      '/clients/from-lead/' + profileId,
      '/contracts/' + profileId + '/amendments',
    ])
      await agent
        .post('/api/v1' + path)
        .send({})
        .expect(403);
  });
  it('ADMIN não pode alterar status, reajustes, renovações nem consultar financeiro privado', async () => {
    profile.role = 'ADMIN';
    await login();
    for (const path of [
      '/contracts/' + profileId + '/amendments',
      '/contracts/' + profileId + '/renewals',
    ])
      await agent
        .post('/api/v1' + path)
        .set('Origin', 'http://127.0.0.1:5173')
        .set('X-CSRF-Token', csrf)
        .send({})
        .expect(403);
    for (const path of ['/contracts/' + profileId + '/status', '/clients/' + profileId + '/status'])
      await agent
        .patch('/api/v1' + path)
        .set('Origin', 'http://127.0.0.1:5173')
        .set('X-CSRF-Token', csrf)
        .send({})
        .expect(403);
    await agent.get('/api/v1/clients/' + profileId + '/financial').expect(403);
  });
  it('rejeita campos injetados e IDs inválidos', async () => {
    await login();
    await agent
      .post('/api/v1/clients')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ companyName: 'Teste', segment: 'ADVOCACIA', responsibleId: profileId, role: 'OWNER' })
      .expect(400);
    await agent.get('/api/v1/contracts/not-an-id').expect(400);
    await agent.get('/api/v1/clients?status=INVALID').expect(400);
  });
});
describe('Prospecting security', () => {
  it('exige sessao e MFA nos endpoints novos', async () => {
    for (const path of ['/usage', '/assignees', '/leads', '/leads/' + profileId])
      await agent.get('/api/v1/prospecting' + path).expect(401);
    for (const path of [
      '/places/search',
      '/places/place_test_1/details',
      '/leads',
      '/leads/' + profileId + '/notes',
      '/leads/' + profileId + '/interactions',
      '/leads/' + profileId + '/follow-ups',
    ])
      await agent
        .post('/api/v1/prospecting' + path)
        .set('Origin', 'http://127.0.0.1:5173')
        .set('X-CSRF-Token', csrf)
        .send({})
        .expect(401);
    identity.aal = 'aal1';
    await login();
    await agent.get('/api/v1/prospecting/usage').expect(403);
  });
  it('permite ADMIN e bloqueia busca sem chave e autoridade injetada', async () => {
    profile.role = 'ADMIN';
    await login();
    process.env.GEOAPIFY_PLACES_ENABLED = 'false';
    await agent.get('/api/v1/prospecting/usage').expect(200);
    await agent
      .post('/api/v1/prospecting/places/search')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ segment: 'ADVOCACIA' })
      .expect(503);
    await agent
      .post('/api/v1/prospecting/leads')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ companyName: 'Fixture isolada', segment: 'ADVOCACIA', userId: ownerId })
      .expect(400);
    await agent.get('/api/v1/prospecting/leads?status=INVALID').expect(400);
  });
});

it('falha de banco no CRM retorna erro seguro sem dados de conexão', async () => {
  await login();
  db.lead.findMany = jest.fn(async () => []);
  db.lead.count = jest.fn(async () => 0);
  db.$transaction.mockRejectedValueOnce(
    new Error('postgresql://sensitive-user:sensitive-password@private-host/db'),
  );
  const response = await agent.get('/api/v1/prospecting/leads').expect(500);
  expect(JSON.stringify(response.body)).not.toMatch(/sensitive|private-host|postgresql|stack/);
});

// Nenhuma chamada Google real: apenas guards reais + banco/identidade/provedor simulados.
describe('VYMPAI HTTP: sessão, MFA, CSRF e isolamento', () => {
  const path = '/api/v1/ai/conversations';
  it('nega IA anônima, sem MFA e com perfil inativo', async () => {
    await agent.get('/api/v1/ai/status').expect(401);
    identity.aal = 'aal1';
    await login();
    await agent.get(path).expect(403);
    identity.aal = 'aal2';
    profile.active = false;
    await agent.get(path).expect(403);
  });
  it('exige CSRF e Origin para criar/excluir/enviar', async () => {
    await login();
    await agent.post(path).send({ title: 'Fixture' }).expect(403);
    await agent.delete(path + '/' + profileId).expect(403);
    await agent
      .post(path + '/' + profileId + '/messages')
      .send({ question: 'Teste', requestKey: ownerId })
      .expect(403);
    await agent
      .post(path)
      .set('Origin', 'https://evil.invalid')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(403);
  });
  it('persiste histórico via HTTP, recarrega e exclui com autorização', async () => {
    await login();
    const c = await agent
      .post(path)
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ title: 'Fixture' })
      .expect(201);
    const response = await agent
      .post(path + '/' + c.body.id + '/messages')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ question: 'Olá', requestKey: ownerId })
      .expect(201);
    expect(response.body.answer).toBe('Resposta de fixture.');
    expect(
      (await agent.get(path + '/' + c.body.id + '/messages').expect(200)).body.items,
    ).toHaveLength(1);
    await agent
      .delete(path + '/' + c.body.id)
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await agent.get(path + '/' + c.body.id + '/messages').expect(404);
  });
  it('bloqueia leitura e exclusão após troca de perfil', async () => {
    await login();
    await agent
      .post(path)
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(201);
    profile.role = 'ADMIN';
    await agent.get(path + '/' + profileId + '/messages').expect(404);
    await agent
      .delete(path + '/' + profileId)
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .expect(404);
  });
  it('rejeita campos extras, IDs inválidos e perguntas vazias antes do SDK', async () => {
    await login();
    await agent.get(path + '/invalido/messages').expect(400);
    await agent
      .post(path)
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ role: 'OWNER' })
      .expect(400);
    await agent
      .post(path + '/' + profileId + '/messages')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf)
      .send({ question: ' ', requestKey: ownerId })
      .expect(400);
  });
});

it('estado de processamento da IA é consultado somente no perfil e papel autenticados', async () => {
  await login();
  db.aiMessage.findFirst.mockResolvedValueOnce({
    conversationId: profileId,
    createdAt: new Date(),
  });
  const r = await agent.get('/api/v1/ai/status').expect(200);
  expect(r.body.pending.conversationId).toBe(profileId);
  expect(db.aiMessage.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        conversation: { profileId, role: 'OWNER' },
        status: 'PENDING',
      }),
      select: { conversationId: true, createdAt: true },
    }),
  );
});
