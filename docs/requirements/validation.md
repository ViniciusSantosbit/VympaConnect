# Validação da etapa 01

Ambiente local: Windows, Node.js 24.22.1 LTS, npm 11.19.1. Data: 26/10/2026.

Resultados efetivamente executados, separados de configurações apenas preparadas:

| Verificação                    | Resultado                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| npm install                    | Executado; lockfile gerado, sem force ou legacy-peer-deps                             |
| npm ci                         | Passou: 1.027 pacotes instalados em instalação limpa                                  |
| TypeScript strict              | Passou nos três workspaces                                                            |
| ESLint 10                      | Passou                                                                                |
| Build shared, NestJS e Vite    | Passou                                                                                |
| Prisma generate                | Passou, client 7.10.1 gerado                                                          |
| Prisma validate / migrate diff | Schema válido; SQL gerado corresponde à migration técnica; execução no banco pendente |
| Jest / Supertest               | 10 testes passaram em 3 suítes, incluindo composição do AppModule e OpenAPI           |
| Vitest / React Testing Library | 1 teste passou                                                                        |
| Playwright Chromium            | 2 cenários passaram: desktop e mobile                                                 |
| Inspeção visual                | Screenshots desktop/mobile inspecionadas; sem overflow horizontal                     |
| Imports locais circulares      | Nenhum ciclo detectado nos fontes web/API/shared                                      |
| npm audit                      | Zero vulnerabilidades após override de Multer 2.5.0                                   |
| PostgreSQL / persistência real | Não validado: conexão recusada em localhost:5432                                      |
| Migration aplicada no banco    | Não validada: banco indisponível; migrate deploy falhou                               |
| Inicialização completa da API  | Depende de PostgreSQL; não marcar como validada localmente                            |
| Swagger em servidor real       | Depende da inicialização completa da API                                              |
| Docker Compose e Dockerfiles   | Preparados, mas não executados: Docker ausente                                        |
| GitHub Actions                 | Workflow preparado; não executado remotamente                                         |
| Railway / Vercel               | Sem deploy; apenas preparação documental/configuração SPA                             |

Os testes HTTP isolados não comprovam conectividade de banco. O teste de composição do AppModule substitui somente DatabaseService para verificar providers reais, configuração e OpenAPI sem banco; essa substituição existe apenas no teste. O comando test:smoke:api inicia o processo real sem substituições e exige PostgreSQL.

O sandbox bloqueou sockets locais dos testes HTTP com EACCES. A repetição autorizada fora do sandbox passou. A configuração Jest pré-carrega entrypoints ESM do NestJS 12 antes dos plugins CommonJS; o Node ainda exibe aviso de VM Modules experimental no runner Jest. Não foi necessário rebaixar o NestJS.

## Completar a validação do banco e dos containers

Instalar e iniciar Docker Desktop (ou disponibilizar PostgreSQL local compatível), abrir novo terminal e executar na raiz:

```sh
npm run setup
npm run db:up
npm run db:generate
npm run db:deploy
npm run build
npm run db:check
npm run test:smoke:api
docker compose config --quiet
docker compose --profile apps up -d --build
```

Verificar http://localhost:8080, http://localhost:3000/api/v1/health e http://localhost:3000/api/docs. O smoke test encerra seu próprio processo ao terminar. Se usar banco externo/local existente, atualizar DATABASE_URL em apps/api/.env; não sobrescrever credenciais existentes. Não tratar health como readiness de banco após o bootstrap.

## Reproduzir qualidade

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run check:cycles
npx playwright install chromium
npm run test:e2e
```

Integrações e regras comerciais continuam fora desta etapa; não há credenciais reais, dados de negócio, chamadas externas de negócio ou login operacional.
