# Validação executada em 30/10/2026

| Comando / verificação             | Resultado                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| git status / branch / remote      | main limpa e sincronizada no início, remoto correto, commit c368811                                                                                                                                                            |
| Inventário .env / Git             | Quatro arquivos locais preservados e ignorados; somente exemplos rastreados                                                                                                                                                    |
| npm run typecheck                 | PASSOU nos três workspaces                                                                                                                                                                                                     |
| npm run lint                      | PASSOU                                                                                                                                                                                                                         |
| npm run format:check              | PASSOU antes da documentação nova                                                                                                                                                                                              |
| npm run check:cycles              | PASSOU: sem ciclos locais                                                                                                                                                                                                      |
| npm run build                     | PASSOU shared, API e Web; aviso de chunk Web acima de 500 kB                                                                                                                                                                   |
| npm run db:validate               | PASSOU: schema Prisma válido, versão 7.10.1                                                                                                                                                                                    |
| npm run db:supabase:check         | FALHOU: DNS/TCP/TLS aprovados fora do sandbox; PostgreSQL 28P01                                                                                                                                                                |
| Jest API                          | PASSOU na repetição: 18 suítes, 296 testes                                                                                                                                                                                     |
| Vitest Web                        | PASSOU isoladamente com --maxWorkers=1: 11 arquivos, 69 testes. Execução concorrente anterior teve 8 timeouts de 5 s                                                                                                           |
| Playwright                        | 52/54 PASSARAM; 2 timeouts no cenário que percorre dez rotas sem sessão (desktop/mobile); aguardava restauração de sessão. Repetição específica com --workers=1 --timeout=90000: 2/2 PASSARAM (15,4 s desktop e 14,2 s mobile) |
| npm ci / npm audit                | NÃO EXECUTADOS nesta etapa; dependências existentes utilizadas                                                                                                                                                                 |
| Integração real banco/Auth/Gemini | NÃO VALIDADA em produção                                                                                                                                                                                                       |
| Migrations remotas                | ZERO aplicadas nesta execução; estado existente desconhecido                                                                                                                                                                   |
| Vercel / domínio / HTTPS real     | NÃO VALIDADOS                                                                                                                                                                                                                  |

A primeira execução Jest sofreu cinco falhas de carregamento de módulos por um build concorrente recriar dist; a repetição após o build passou integralmente. Não alterar código para mascarar essa disputa de artefatos. A suíte Web isolada passou sem alterar timeouts nem código. E2E completo teve dois timeouts; a repetição específica deve ser registrada separadamente.

Os testes de interface utilizam transporte simulado nos próprios testes. Resultados não comprovam login/MFA, persistência, integrações externas nem recuperação real em produção. Não foram criados dados comerciais remotos, feitos disparos de e-mail ou chamadas reais Gemini nesta execução.

Repetição Playwright: `npm run test:e2e -- --grep "todas as rotas do workspace" --workers=1 --timeout=90000`. As duas verificações passaram sem alterar o código ou as assertions; apenas orçamento total de execução ampliado na CLI. A execução integral padrão continua registrada com 52/54 aprovados. Documentação adicionada localmente; nenhum commit/push de deploy nesta etapa.

## Ajuste de URL da API

Cliente Web: 11 testes direcionados aprovados em api-url.test.ts; ESLint direcionado e git diff --check aprovados; build Web com typecheck aprovado. Aviso de chunk acima de 500 kB permanece. Nenhum deploy ou push executado nesta retomada.

## API produtiva — preparação

Build API aprovado. Novas validações e armazenamento de rate limit: suíte API ampliada para 315 testes, todos aprovados em 20 suítes fora do sandbox. Primeira execução dentro do sandbox falhou em 41 testes HTTP por EACCES; repetição autorizada passou sem alterar assertions. ESLint direcionado aprovado. Chaves Cloud validadas nos endpoints somente leitura do projeto: publishable HTTP 200 e secret HTTP 200. Não executados bootstrap OWNER, provisionamento runtime, testes MFA Cloud, deployment Preview ou produção.

Último ajuste de proxy: build API recompilado e 24 testes direcionados (health/configuração produtiva/rate limit) passaram após a alteração.

## Evidências remotas após autorização específica

Bootstrap: 1 OWNER ativo e 1 evento de auditoria. Runtime: PostgreSQL e Prisma aprovados usando papel sem privilégios administrativos, schemas auth/storage inacessíveis, escrita técnica de rate limit revertida por rollback. Backup criptografado e catálogo pg_restore validados; restauração completa pendente. Vercel: CLI autenticada, dois projetos criados e domínio solicitado associado/verified=true. Nenhum deployment ou teste MFA real executado.

Variáveis Vercel: 14 nomes verificados por env ls como Hidden / Secret / Production no projeto vympaconnect-api após autorização explícita. Nenhum segredo exibido. Script de configuração passou ESLint e foi executado com sucesso. Preview não criado ainda; nenhum teste/deployment de Preview executado.
