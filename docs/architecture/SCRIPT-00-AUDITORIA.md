# SCRIPT 00 — Auditoria da fundação VYMPA Connect

Data: 26/10/2026 (America/Sao_Paulo). Workspace: `C:\Users\vinicius\Desktop\VympaConnect`. Commit inicial auditado: `944f777`.

## 1. Estrutura encontrada

Monorepo npm workspaces, com `apps/*` e `packages/*`:

```text
apps/api/                 NestJS ESM, configuração, health e serviço Prisma
  prisma/                 schema e migration 20261026000100_foundation
  scripts/                verificação de conexão e escrita técnica
  src/modules/            health implementado; demais domínios documentados
  src/integrations/       interfaces para IA, email, Places e storage
  test/                   Jest/Supertest, ambiente e composição do AppModule
apps/web/                 React/Vite, layout, rotas e componentes locais
packages/shared/          schemas Zod, tipos de health e constantes de módulos
infrastructure/docker/    Dockerfiles API/web e nginx
infrastructure/scripts/   setup, smoke da API, ciclos e inventário de versões
tests/e2e/                Playwright desktop/mobile
.github/workflows/ci.yml  pipeline de qualidade com PostgreSQL de serviço
.husky/                   hook de pre-commit
docs/                     arquitetura, API, banco, integrações, requisitos e segurança
```

Arquivos de aplicação não foram modificados. Não foi recriada a estrutura, apagado arquivo de aplicação ou configurado serviço remoto. Não foram encontradas instruções AGENTS.md no workspace. O Git estava limpo no início.

Existem exemplos de ambiente na raiz, API e web. Não havia `.env` local em nenhum dos três locais, nem `DATABASE_URL`, `DIRECT_URL` ou `NODE_ENV` herdados no processo inspecionado. O script setup copia exemplos sem sobrescrever arquivos existentes; não foi necessário executá-lo para a inspeção.

Busca por conteúdo idêntico em apps, packages, infrastructure e .github, excluindo dependências/artefatos: apenas quatro READMEs de integrações repetidos, sem duplicação de implementação identificada. Ausência de módulos comerciais executáveis é intencional e explicitada nos placeholders.

## 2. Tecnologias e versões

Runtime efetivamente encontrado: **Node.js 24.21.0 e npm 11.19.0**, compatíveis com os engines declarados (`>=24 <25`, npm `>=11`). `.nvmrc` fixa apenas a major 24. O documento anterior relata Node 24.22.1/npm 11.19.1; isso não corresponde ao runtime desta auditoria.

Versões efetivamente instaladas, conferidas por `npm ls --depth=0` após `npm ci` bem-sucedido e alinhadas ao lockfile v3:

| Camada                  | Versões fixadas                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Linguagem               | TypeScript 6.0.3                                                                        |
| Frontend                | React/React DOM 19.3.1, Vite 8.3.5, React Router 8.5.0                                  |
| UI                      | Tailwind 4.3.3, Radix Dialog 1.3.1, Radix Slot 1.5.0, Lucide 1.61.0                     |
| Estado/HTTP/formulários | TanStack Query 5.105.0, Axios 1.20.0, Zustand 5.0.16, React Hook Form 7.91.0, Zod 4.6.7 |
| Backend                 | NestJS common/core/platform-express 12.2.0, CLI 12.0.10, Config 12.0.1                  |
| Persistência            | Prisma/client/adapter-pg 7.10.1, pg 8.23.1                                              |
| Segurança preparada     | Helmet 8.3.0, Throttler 6.7.1, Argon2 0.45.1, Passport 0.7.0                            |
| Logs                    | nestjs-pino 5.3.1, Pino 10.4.0                                                          |
| Qualidade               | ESLint 10.13.0, typescript-eslint 8.72.0, Prettier 3.9.10                               |
| Testes                  | Jest 30.5.2, Supertest 7.3.1, Vitest 5.0.5, Playwright 1.64.1                           |
| Containers declarados   | PostgreSQL 18-alpine, Redis 8-alpine opcional; Node 24 e nginx unprivileged             |

O inventário completo de dependências diretas está em `docs/requirements/versions.md`; as resoluções transitivas estão no lockfile (1.114 entradas). Comparação automatizada de manifests com entradas dos workspaces no lockfile não apontou divergências. Imagens Docker não foram instaladas/inspecionadas, portanto suas versões efetivas não foram confirmadas.

## 3. Funcionalidades e persistência

### Implementação encontrada por inspeção

- Interface estrutural, navegação responsiva, tela da fundação e placeholders explícitos. Cliente Axios preparado, sem consumo da API pela tela atual; não há dados comerciais, login funcional ou persistência no frontend.
- Backend com prefixo `/api/v1`, health, Swagger em development, validação global, CORS explícito, Helmet, throttling, filtro de erros e logs sanitizados. A confirmação em execução está na seção 4.
- `DatabaseService` usa PrismaPg, exige `DATABASE_URL`, conecta e executa `SELECT 1` no bootstrap; falha impede a API de iniciar. O health é liveness: não verifica disponibilidade do banco a cada chamada.
- Auth, usuários, MFA, RBAC, auditoria e integrações externas não estão implementados. Bibliotecas instaladas ou interfaces não significam funcionalidades operacionais. `NODE_ENV=production` é rejeitado deliberadamente.

### PostgreSQL, volume e migration

Compose declara PostgreSQL `18-alpine`, porta publicada somente em `127.0.0.1`, credenciais via ambiente, healthcheck `pg_isready` e volume nomeado `postgres_data:/var/lib/postgresql`. Redis é opcional pelo perfil queues. API/web são opcionais pelo perfil apps. Persistência do volume está configurada, mas não foi comprovada por reinício de container.

Há uma migration versionada e `migration_lock.toml` com provider PostgreSQL. SQL e schema apresentam a mesma tabela `system_metadata`, PK UUID, chave única VARCHAR(100), valor TEXT e timestamps TIMESTAMPTZ(3). UUID e updatedAt são tratados pelo Prisma, portanto a ausência de defaults SQL nesses dois campos é coerente para escrita pelo client. Coerência estática não comprova aplicação, histórico ou ausência de drift no banco.

Configuração da CLI em `prisma.config.ts` e runtime em `DatabaseService` usam PostgreSQL. A CLI possui fallback para localhost com credencial de exemplo; o runtime exige URL explícita. Isso merece alinhamento para evitar que a CLI selecione um banco diferente do esperado.

Os exemplos apontam para localhost; o Compose aponta para o hostname interno `postgres`. Não foi encontrada configuração ativa de Supabase ou outro banco externo. Sem `.env`, não há evidência de uma aplicação atualmente conectada. Não houve conexão a banco externo, produção ou escrita em dados reais.

`db:check` **não é somente leitura**: faz upsert da chave técnica `foundation`. Não executar contra banco desconhecido. Testes Jest substituem DatabaseService ou usam HealthModule isolado; não comprovam Prisma/PostgreSQL real.

## 4. Validações desta auditoria

O histórico `docs/requirements/validation.md` permanece como evidência de uma execução anterior, sem transferência automática de seus sucessos para esta auditoria.

| Verificação executada                                                                 | Resultado real                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm ci` no sandbox                                                                   | Falhou com EPERM ao criar diretório de dependência                                                           |
| `npm ci` fora do sandbox                                                              | Passou; 1.027 pacotes instalados, 1.031 auditados, zero vulnerabilidades reportadas                          |
| `npm ls --depth=0`                                                                    | Passou, workspaces vinculados e versões diretas conferidas                                                   |
| `npm run typecheck`                                                                   | Passou em API, web e shared; Prisma Client 7.10.1 gerado                                                     |
| `npm run lint`                                                                        | Passou                                                                                                       |
| `npm run check:cycles`                                                                | Passou: web 17, API 14 e shared 4 arquivos; nenhum ciclo local                                               |
| `prisma validate`                                                                     | Passou                                                                                                       |
| `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`          | Passou sem banco; SQL equivalente à migration existente                                                      |
| `npm test` sem configuração no sandbox                                                | Falhou: 5 testes API passaram/5 falharam; 4 por sockets EACCES, 1 por DATABASE_URL ausente; teste web passou |
| `npm test` fora do sandbox com DATABASE_URL fictícia local definida antes do processo | Passou: 10 testes API em 3 suítes e 1 teste web; sem acesso a banco nesses testes                            |
| Build shared e API                                                                    | Passaram durante `npm test`: tsc, prisma generate e nest build                                               |
| `npm run build -w @vympa/web`                                                         | Passou: Vite 8.3.5, 2.166 módulos; bundle JS 479,66 kB (147,97 kB gzip)                                      |
| `npm run format:check`                                                                | Falhou em 115 arquivos, incluindo a versão inicial deste relatório                                           |
| `prettier --check . --end-of-line auto`                                               | Só o novo relatório apresentou diferença; os demais avisos são explicados pelo CRLF do checkout              |
| Docker                                                                                | `docker --version` não executável: comando ausente; Compose e serviços não puderam ser verificados           |
| TCP local 5432                                                                        | Sandbox retornou EACCES; repetição fora dele confirmou ECONNREFUSED em 127.0.0.1:5432                        |
| `npm run test:smoke:api` com URL exclusivamente local                                 | Falhou: API encerrou antes de iniciar; endpoint real e Swagger não aprovados                                 |
| Migration aplicada, persistência e volume após reinício                               | Não executados: nenhum PostgreSQL local disponível/identificado                                              |
| GitHub Actions remoto                                                                 | Não executado; inspeção do workflow apenas                                                                   |

O smoke recebeu `postgresql://audit:audit@127.0.0.1:5432/vympa_audit`, uma URL fictícia local, para não herdar alvos externos. Não foram executados deploy de migration nem `db:check`, que escreve no banco. Não se afirma que um serviço existe com essas credenciais. A tentativa confirmou falha de bootstrap, e a checagem TCP separada confirmou porta recusada.

O comando agregado `npm run build` não foi executado separadamente; seus três componentes foram executados com sucesso pelos comandos registrados. Não se infere êxito do comando agregado além dessas etapas.

Falha específica de teste: `test/app-module.test.mjs` importa AppModule estaticamente; `ConfigModule.forRoot` valida o ambiente durante a importação. O `process.env.DATABASE_URL ??=` dentro do teste ocorre tarde demais. Configurar uma URL de teste no setup anterior aos imports, ou carregar AppModule dinamicamente após configurar o ambiente, resolve a independência de `.env`. Nesta auditoria, apenas a variável do processo foi definida para validar o restante, sem modificar o teste.

Formatação: `git ls-files --eol` confirmou `i/lf w/crlf` nos arquivos amostrados, e `core.autocrlf=true`; não há `.gitattributes`. Recomenda-se versionar política de LF e normalizar o checkout em uma correção dedicada. Não foi executado formatador em massa.

## 5. Problemas identificados

Complemento das validações: a primeira execução Playwright no sandbox ficou sem progresso e foi interrompida. Fora do sandbox, os dois cenários inicialmente falharam porque o Chromium não estava instalado. `npx --no-install playwright install chromium` concluiu o download; na repetição com `CI=1`, **os dois cenários passaram (desktop Chromium e mobile emulado), em 23,6 s**. Isso comprova navegação, avisos de ambiente e ausência de overflow nos cenários testados, sem validar integração frontend/API ou banco. Os testes geraram screenshots em `test-results`; não houve inspeção visual manual nesta auditoria.

Somente o relatório foi formatado com Prettier; nenhum arquivo existente foi normalizado. A falha de formatação registrada acima descreve o estado da primeira execução. O diff final dos manifests, lockfile, apps, packages, infrastructure e .github permaneceu vazio.

1. Docker não está no PATH e o executável não foi encontrado no caminho convencional do Docker Desktop. Containers, imagens, volume e conexão real não estão validados nesta sessão.
2. `.env` locais ausentes: o checkout ainda exige setup antes de executar a API e o Compose.
3. A URL fallback da CLI Prisma pode mascarar ausência de configuração. Usar configuração explícita em comandos que aplicam migrations.
4. Health não mede readiness contínua do banco. Separar liveness/readiness quando houver necessidade operacional, sem alterar silenciosamente o contrato existente.
5. Testes do backend não cobrem banco real; CI inclui migrations e escrita técnica, mas não há evidência de execução remota nesta auditoria.
6. Backup/restauração não possuem scripts, política de retenção, RPO/RTO ou ensaio documentado. Volume Docker não substitui backup.
7. Supabase, TLS, papéis de banco, conexão de migrations e ambientes remotos ainda não estão definidos.
8. Dockerfiles copiam dependências de desenvolvimento para runtime da API; tags de imagens são móveis e instalação de workspaces completos amplia o build. Rever endurecimento antes de produção, sem bloquear o protótipo local por esse motivo.
9. ConfigModule procura `.env` antes de `apps/api/.env`; executar o binário da raiz pode carregar o arquivo destinado ao Compose. Padronizar cwd/comandos e testar precedência antes de adicionar ambientes.
10. Documentação histórica apresenta versões de runtime diferentes das encontradas. Manter data, ambiente e limitações em cada relatório.
11. Teste de composição depende de ambiente preparado antes da importação; `npm test` em checkout sem `.env` não é autossuficiente. O CI define DATABASE_URL e mascara essa diferença local.
12. Política de finais de linha não está versionada; `format:check` falha no checkout Windows com autocrlf. Os arquivos existentes passaram na checagem diagnóstica com end-of-line auto.

## 6. Correções recomendadas por prioridade

| Prioridade                       | Ação                                                                      | Critério de aceite                                                                 |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1 — bloqueia aprovação integral | Disponibilizar Docker/Compose e preparar somente ambiente local           | Compose válido, serviço healthy, versão SQL e volume inspecionados                 |
| P1                               | Validar migration e API contra banco local descartável                    | migrate deploy/status, persistência técnica e smoke real aprovados                 |
| P1                               | Concluir os comandos de qualidade desta seção 4                           | Instalação, tipos, lint, testes, builds e E2E com resultados reproduzíveis         |
| P1                               | Corrigir inicialização de ambiente do teste e política de finais de linha | npm test sem .env e format:check passando em checkout limpo                        |
| P2 — antes de banco remoto       | Remover ambiguidade de URLs/precedência de env                            | CLI e runtime apontam para o ambiente explicitamente selecionado                   |
| P2                               | Definir backup e restauração                                              | Backup local restaurado em banco separado, com conferência de dados                |
| P2                               | Preparar segurança e conexões de produção                                 | Papéis mínimos, TLS, gestão de segredos, migrations de release e revisão de acesso |
| P3                               | Endurecer imagens e complementar testes                                   | Runtime enxuto, imagens rastreáveis e readiness se necessária                      |

## 7. Pendências para o Script 01

- Encerrar os bloqueios de instalação/qualidade que constarem na seção 4.
- Instalar/iniciar Docker Desktop ou prover PostgreSQL local descartável devidamente identificado.
- Executar `npm run setup`, revisar exemplos locais e garantir coerência entre credenciais/portas do Compose e URL da API.
- Executar `docker compose config --quiet`, `npm run db:up`, `npm run db:deploy`, verificar status das migrations e `npm run db:check` apenas nesse banco local.
- Executar `npm run test:smoke:api` para bootstrap real, `/api/v1/health` e Swagger; testar também containers do perfil apps e preservação após reinício sem remover volumes.
- Atualizar evidências e o parecer antes de declarar a fundação integralmente aprovada.

## 8. Requisitos para o Script 02 — PostgreSQL e Supabase

Não criar projeto remoto nesta etapa. Preparar:

1. Desenvolvimento com Docker PostgreSQL, volume persistente, credenciais locais exclusivas, migrations versionadas e banco descartável para testes. Confirmar a versão PostgreSQL alvo antes de depender de recursos específicos da major 18.
2. Separar desenvolvimento, teste, homologação e produção. Exemplos sem segredos; `.env` ignorados; segredos remotos no mecanismo seguro do provedor/CI. Nunca colocar URL de banco ou credenciais privilegiadas em `VITE_*`.
3. Definir posteriormente o endpoint Supabase adequado para runtime e para migrations, incluindo pooling, limites e acesso de rede. Conferir a configuração vigente do serviço antes da implementação. Só introduzir variável separada de conexão direta se adotada explicitamente na configuração Prisma.
4. Exigir transporte TLS com validação de certificado; definir usuário de runtime com privilégios mínimos e papel separado para DDL/migrations. Decidir acesso ao schema public e eventual exposição pela Data API/RLS conforme o modelo de acesso escolhido.
5. Usar `migrate dev` apenas em desenvolvimento e `migrate deploy` em release controlada; revisar SQL, conferir estado/drift e preparar recuperação antes de mudanças destrutivas. Não usar db push em produção nem executar migrations concorrentes sem coordenação.
6. Definir RPO/RTO, frequência, retenção, criptografia, responsáveis e acesso aos backups. Prever dump/restore compatíveis com a versão alvo e, conforme o plano contratado, recursos gerenciados de recuperação. Testar restauração isolada e documentar conferências e tempo de recuperação.
7. Para contratos, escolher storage privado, metadados no banco, autorização por recurso, URLs assinadas curtas, limites e validação de conteúdo, varredura, versionamento e política de retenção. A interface atual de storage é apenas um contrato; nenhuma proteção está operacional. Backup dos objetos deve ser planejado separadamente do backup SQL.
8. Manter o bloqueio de produção até autenticação, MFA, autorização, auditoria e demais controles definidos serem implementados e validados. Preparar Supabase não equivale a liberar o produto para dados reais.

## Parecer

**Fundação ainda não aprovada integralmente para avançar ao Script 02. O Script 01 exige correções e fechamento de validações.** A organização existente pode ser preservada: instalação, tipos, lint, geração Prisma, builds e testes isolados configurados foram comprovados. Permanecem o teste de composição sem ambiente, formatação multiplataforma e, principalmente, PostgreSQL/Docker, aplicação de migrations e bootstrap/health reais. É possível planejar o Script 02 com os requisitos acima; não declarar banco operacional nem iniciar configuração remota como se a fundação já estivesse homologada.
