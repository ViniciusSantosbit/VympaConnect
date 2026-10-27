# SCRIPT 01 — Correções da fundação e ambiente local

Data: 26/10/2026, America/Sao_Paulo. Node.js 24.21.0, npm 11.19.0. Arquitetura React + NestJS + Prisma + PostgreSQL preservada.

## 1. Problemas encontrados

- ConfigModule procurava `.env` relativo ao cwd antes do ambiente da API; executar da raiz podia carregar o arquivo destinado ao Compose.
- CLI Prisma usava dotenv relativo ao cwd e URL local silenciosa como fallback.
- Teste de composição importava AppModule antes de definir DATABASE_URL.
- Checkout Windows com `core.autocrlf=true` tinha CRLF; faltava política versionada e `format:check` falhava.
- Docker não está acessível, nem foi encontrada instalação nos caminhos convencionais ou nos registros de desinstalação consultados.

## 2. Correções realizadas

1. ConfigModule resolve `apps/api/.env` por `import.meta.url`, funcionando tanto com fontes quanto com `dist`, independentemente do cwd. O arquivo raiz não é carregado. Variáveis do processo preservam precedência.
2. Prisma resolve o mesmo arquivo por caminho absoluto e não sobrescreve variáveis do processo. Datasource só é definido quando DATABASE_URL está explicitamente configurada. Generate/validate não precisam de conexão; operações de migration sem URL são recusadas pelo Prisma, sem escolher destino implícito.
3. Setup Jest define NODE_ENV=test, URL fictícia de loopback, CORS e logs antes dos imports. ConfigModule ignora `.env` em test. Testes HTTP continuam substituindo DatabaseService, sem conexão nem escrita em banco. A atribuição tardia foi removida do teste de composição.
4. `.gitattributes` define texto LF e preserva formatos binários comuns. Prettier explicita LF. Foram normalizados somente CRLF para LF em 131 arquivos rastreados: sem alteração de conteúdo ou reformatação em massa. Não foi necessário alterar ESLint, índice Git ou configuração global/local do Git.
5. Exemplos e documentação esclarecem a separação de ambiente e o requisito de URL explícita. Nenhuma credencial real foi criada, exibida ou versionada.

## 3. Arquivos alterados

- `.gitattributes` (novo): política de finais de linha.
- `.prettierrc`: endOfLine LF.
- `.env.example` e `apps/api/.env.example`: comentários sobre separação/precedência.
- `apps/api/src/app.module.ts`: caminho de ambiente e isolamento de testes.
- `apps/api/prisma.config.ts`: caminho explícito e remoção de fallback.
- `apps/api/test/setup.mjs`: configuração fictícia anterior aos imports.
- `apps/api/test/app-module.test.mjs`: remoção da atribuição tardia.
- `README.md` e `docs/database/README.md`: comandos/contratos de configuração documentados.
- Este relatório.

As conversões de CRLF para LF dos demais arquivos não alteram o conteúdo versionado, que já estava em LF no índice. O relatório do Script 00 foi preservado como histórico e já estava presente, não rastreado, no início desta execução. Manifests, lockfile, dependências, schema, SQL das migrations e módulos de negócio não foram alterados.

## 4. Testes executados e resultados reais

| Comando/verificação                                                   | Resultado                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                   | Passou nos três workspaces; generate Prisma 7.10.1 sem DATABASE_URL                                    |
| `npm run lint`                                                        | Passou                                                                                                 |
| `npm run format:check`                                                | Passou após normalização LF                                                                            |
| `npm test` sem `.env` nem DATABASE_URL herdada                        | Passou: 10 testes API em 3 suítes e 1 teste web                                                        |
| `npm run build`                                                       | Passou: shared, API NestJS e frontend Vite                                                             |
| `npm run check:cycles`                                                | Passou: 17 arquivos web, 14 API, 4 shared; nenhum ciclo local                                          |
| `npm run test:e2e`, CI=1                                              | Passou: desktop Chromium e mobile emulado, 2 cenários, 12,4 s                                          |
| `prisma validate --config apps/api/prisma.config.ts` da raiz          | Passou sem `.env` nem banco                                                                            |
| `prisma migrate status --config apps/api/prisma.config.ts` sem URL    | Recusado como esperado, exit 1 por datasource ausente; não conectou a banco                            |
| `npm run test:smoke:api` com URL fictícia exclusivamente em 127.0.0.1 | Falhou: API encerrou antes de iniciar                                                                  |
| TCP 127.0.0.1:5432 fora do sandbox                                    | ECONNREFUSED                                                                                           |
| Docker/Compose                                                        | Comando docker não localizado; sem serviço Docker encontrado fora do sandbox; caminhos padrão ausentes |
| Migrations aplicadas/status de um banco real                          | Não executados: banco local do projeto indisponível                                                    |
| Escrita técnica/leitura/reinício/persistência                         | Não executados: bloqueados pela ausência de Docker/PostgreSQL                                          |
| Health/Swagger em servidor real                                       | Não aprovados: bootstrap depende de PostgreSQL                                                         |

Testes HTTP e Playwright foram executados fora do sandbox para permitir sockets locais, conforme bloqueio EACCES já identificado no Script 00. O Jest mantém o aviso de VM Modules experimental, mas concluiu com exit 0. As dependências instaladas no Script 00 foram reutilizadas; não houve mudança de versões ou nova instalação npm nesta etapa.

O smoke utilizou somente uma URL fictícia local, sem carregamento de `.env`. A falha do servidor real é limitação do ambiente; não foi mascarada com mock. Os testes isolados de health e composição passaram e não equivalem à validação integrada com PostgreSQL.

## 5. Status do Docker e PostgreSQL local

Verificação adicional: `prisma migrate deploy --config apps/api/prisma.config.ts` sem DATABASE_URL também foi recusado com exit 1 por datasource ausente, antes de conectar. `git diff --check` passou; o diff de conteúdo dos arquivos rastreados contém somente as nove alterações listadas, além dos novos arquivos documentais e `.gitattributes`.

Evidências: `where.exe docker` não encontrou executável; Get-Command também não. Não existem executáveis nos caminhos `C:\Program Files\Docker\Docker` nem `%LOCALAPPDATA%\Programs\DockerDesktop` verificados. Não foi encontrado serviço Docker em consulta fora do sandbox nem entrada Docker nos registros de desinstalação consultados. Isso aponta para instalação ausente nos locais usuais; não é apenas evidência de daemon parado. Uma instalação em diretório personalizado ainda precisaria ser informada e adicionada ao PATH.

Nenhum PostgreSQL respondeu na porta local 5432. Sem Docker, não foi possível executar Compose, identificar container/volume do projeto ou confirmar que um banco é descartável. Por isso não foram criados `.env` locais, aplicadas migrations, executados upserts ou reiniciados containers. Não foi acessado Supabase, banco remoto ou produção.

### Ação necessária do usuário

1. Instalar Docker Desktop para Windows pelo [guia oficial](https://docs.docker.com/desktop/setup/install/windows-install/), conferindo requisitos de Windows, virtualização e WSL 2. Nenhuma aplicação de sistema foi instalada nesta execução.
2. Abrir Docker Desktop pelo menu Iniciar, concluir a configuração e aguardar o engine iniciar em modo de containers Linux. Reabrir o terminal/Codex para atualizar o PATH.
3. Confirmar `docker --version`, `docker compose version` e `docker info`. Se já houver instalação personalizada, disponibilizar seu executável no PATH e iniciar o Desktop.
4. Retomar a sequência abaixo neste workspace. A instalação/configuração do sistema é uma ação pendente do usuário, não um teste aprovado.

## 6. Validação de persistência pendente

Volume declarado no Compose: `postgres_data:/var/lib/postgresql`, preservado por reinício. Configuração estática não comprova persistência real. Após Docker disponível:

1. Executar `npm run setup` (não sobrescreve `.env`), revisar exclusivamente credenciais de desenvolvimento e manter raiz/API coerentes. Não imprimir conteúdo de `.env` nem Compose expandido; preferir `docker compose config --quiet`.
2. Confirmar contexto Docker local, projeto Compose, ausência de alvo remoto e propriedade dos recursos. Inspecionar eventual container/volume existente antes de reutilizá-lo. Não tratar a existência de um volume como autorização para descartá-lo.
3. Iniciar somente `docker compose up -d postgres`; conferir `docker compose ps postgres` e status de saúde. Inspecionar apenas nome, driver e mountpoint do volume associado, sem despejar variáveis/credenciais do container.
4. Confirmar banco local de desenvolvimento do VYMPA Connect antes de qualquer escrita; revisar o SQL existente (uma tabela técnica system_metadata, sem comandos de remoção).
5. Executar `npm run db:generate`, `npm run db:deploy` e `npm exec -w @vympa/api -- prisma migrate status`. URL explícita deve apontar ao banco local confirmado. Não usar db push/reset.
6. Executar `npm run db:check`: faz upsert controlado da chave técnica foundation e verifica o valor retornado. Consultar o registro em uma operação separada de somente leitura.
7. Executar `docker compose restart postgres`; aguardar saúde e consultar novamente a chave em modo **somente leitura**. Não usar db:check como única prova após reinício, pois ele recriaria um registro ausente.
8. Confirmar mesmo id/valor e volume. Executar `npm run test:smoke:api` para validar bootstrap real, health e Swagger. Registrar resultados antes de aprovar.

Não foi utilizado `docker compose down -v` nem qualquer remoção de arquivos, dados ou volumes.

## 7. Pendências e parecer sobre o Script 02

**Correções independentes do Docker concluídas e verificadas. Fundação ainda não aprovada integralmente para iniciar a execução do Script 02.**

O único bloqueio de execução remanescente identificado nesta etapa é disponibilizar Docker/PostgreSQL local e concluir Compose, migrations aplicadas, escrita/leitura, persistência após reinício e smoke/Swagger reais. Pode-se planejar o Script 02; sua execução deve aguardar essas evidências. A ausência de validação integrada não deve ser registrada como sucesso ou corrigida removendo a exigência de banco no bootstrap.

Autenticação, MFA, RBAC, backups/restauração e produção continuam fora da entrega desta correção, conforme requisitos do Script 00. Nenhum módulo comercial foi desenvolvido, nenhuma aplicação publicada e nenhum projeto remoto criado.
