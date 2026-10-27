# VYMPA Connect

Fundação técnica da plataforma administrativa interna da VYMPA. Monólito modular B2B para futura gestão comercial, clientes, contratos, finanças, metas e IA.

**Etapa 01 · Desenvolvimento. Não inserir dados reais. Autenticação, MFA e autorização ainda não foram implementadas; uso em produção está bloqueado.**

## Stack e estrutura

React 19, TypeScript 6, Vite 8, Tailwind CSS 4 e componentes shadcn/ui locais com Radix. React Router, TanStack Query, React Hook Form, Zod, Recharts, Lucide, Axios, Zustand e Sonner preparados.
API NestJS 12/Express, Prisma 7 com adapter PostgreSQL, OpenAPI, Pino, Helmet, validação e throttling. Node.js 24 LTS e npm workspaces.
Vitest/RTL, Jest/Supertest e Playwright; ESLint, Prettier, Husky, lint-staged e GitHub Actions.

```text
apps/web             Interface administrativa e features futuras
apps/api             API modular, configuração, integrações e Prisma
packages/shared      Contratos, schemas e constantes públicos
infrastructure       Dockerfiles, nginx e scripts multiplataforma
docs                 Arquitetura, banco, API, integrações e segurança
tests/e2e            Navegação desktop e mobile com Playwright
.github/workflows    Pipeline de qualidade
```

Versões exatas: [inventário](docs/requirements/versions.md) e package-lock.json.

## Requisitos e instalação

Node.js 24 LTS, npm 11+, Git e Docker Desktop com Compose v2 (Windows/macOS) ou Docker Engine + Compose v2 (Linux). Não há dependência de comandos bash nos scripts npm.

Na raiz do workspace:

```sh
npm ci
npm run setup
npm run db:up
npm run db:generate
npm run db:deploy
npm run build
npm run db:check
npm run dev
```

Na primeira instalação sem lockfile, npm install é equivalente. O lockfile está versionado para instalações reproduzíveis. npm run setup copia exemplos sem sobrescrever .env existentes. .env raiz configura Compose; apps/api/.env configura a API e Prisma; apps/web/.env só contém valores públicos do Vite. Se mudar usuário/senha/porta do PostgreSQL, atualizar DATABASE_URL também. Nunca usar credenciais locais em um ambiente real.

A API e a CLI Prisma resolvem exclusivamente `apps/api/.env` a partir de seus arquivos, sem depender do diretório do terminal. Não carregam o `.env` da raiz. Variáveis já definidas no processo têm precedência; revise o ambiente antes de comandos de banco. Não existe URL fallback: generate/validate funcionam sem banco configurado, mas migrations exigem `DATABASE_URL` explícita. Os testes isolados definem valores fictícios no setup e ignoram arquivos `.env`.

Finais de linha LF são definidos em `.gitattributes` e no Prettier. Não é necessário alterar configurações globais do Git. Validações desta correção e bloqueios locais: [Script 01](docs/architecture/SCRIPT-01-CORRECOES.md).

`npm run dev` inicia shared em watch, frontend e API. Também é possível usar `npm run dev:web` e `npm run dev:api` em terminais separados.

- Web: http://localhost:5173
- Health: http://localhost:3000/api/v1/health
- Swagger (somente development): http://localhost:3000/api/docs

A API exige banco acessível no bootstrap. Integrações futuras não exigem credenciais. Não há login falso nem endpoints de negócio. Rotas de módulos futuros exibem placeholders explícitos.

## Docker

Somente banco: `npm run db:up`.
Redis opcional: `docker compose --profile queues up -d`.
Aplicações e banco: `docker compose --profile apps up -d --build`.
Após iniciar PostgreSQL, aplicar migrations pelo host com `npm run db:deploy` ou pelo container com `docker compose --profile apps run --rm api npx prisma migrate deploy`.
Web em http://localhost:8080 e API em http://localhost:3000.
Containers desta etapa continuam sendo de desenvolvimento; o build da interface não remove os avisos. Dockerfiles são multi-stage e usam contexto da raiz. API roda com usuário node; nginx usa porta não privilegiada.

`npm run db:down` preserva volumes. Não usar down -v se houver dados que deseja conservar.

## Banco e migrations

A primeira migration cria apenas system_metadata. Nenhuma tabela comercial antecipada.

```sh
npm run db:deploy
npm run db:check
npm run db:migrate -w @vympa/api -- --name nome_da_alteracao
```

Não usar db push como substituto de migrations. [Modelagem planejada](docs/database/README.md).

## Qualidade e testes

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run check:cycles
npx playwright install chromium
npm run test:e2e
```

Jest testa código compilado ESM com decorators reais; o comando de testes da API compila antes. Testes HTTP usam HealthModule com os mesmos controles globais, sem exigir banco. Não simulam validação de conexão: essa verificação é separada em db:check. Playwright inicia Vite e cobre tela estrutural, navegação e ausência de erros JS em desktop e mobile.

Husky é ativado por npm install/ci se houver repositório Git. Após criar/associar Git, execute `npm run prepare`. O hook aplica ESLint/Prettier aos arquivos staged. Não foi criado commit nem remoto automaticamente.

CI executa npm ci, tipos, lint, formatação, testes, build, migrations, persistência, ciclos e E2E em PostgreSQL de serviço. Pipeline remoto só é validado após publicação pelo usuário.

## Documentação e estado

- [Arquitetura e padrões](docs/architecture/README.md)
- [Banco e relacionamentos futuros](docs/database/README.md)
- [API e semântica do health](docs/api/README.md)
- [Maps, IA, arquivos privados e integrações](docs/integrations/README.md)
- [Segurança e próximos controles](docs/security/README.md)
- [Escopo](docs/requirements/README.md)
- [Resultados reais de validação](docs/requirements/validation.md)

Próxima fase: autenticação administrativa, MFA, sessões seguras, RBAC e auditoria, antes de receber dados comerciais. Deploy Railway/Vercel será posterior; não foi executado.
