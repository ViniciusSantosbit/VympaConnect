# Script 10 — implantação em andamento

Atualizado em 30/10/2026. Este registro descreve evidências desta execução; os documentos da fundação não representam o estado atual dos módulos.

## Estado e ponto de retomada

**Produção não publicada.** Conexão Supabase corrigida e validada com DNS, TCP, TLS e SELECT 1. Auditoria somente leitura confirmou oito migrations aplicadas com checksums iguais aos arquivos locais, 39 tabelas com RLS e zero usuários Auth/perfis administrativos. Nenhuma escrita remota nesta execução. Evidência: `database-audit.json`.

Retomada atual: cadastro da identidade real pelo usuário no formulário Supabase aberto; depois conferir autorização OWNER, provisionar runtime restrito e validar Preview isolado. Acessos Vercel/Supabase e credenciais Auth Cloud já foram verificados. Não migrar novamente as oito migrations existentes nem remover proteções para forçar o deploy.

| Atividade                | Estado      | Evidência / pendência                                                                                |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| Auditoria do repositório | CONCLUÍDO   | Workspace real e código inspecionados; diagnóstico abaixo                                            |
| Verificação dos `.env`   | CONCLUÍDO   | Inventário sem valores em `environment-inventory.md`; credencial remota corrigida e validada         |
| Segurança e autenticação | EM EXECUÇÃO | Guards, MFA e CSRF implementados; validação produtiva pendente                                       |
| Conexão Supabase Cloud   | CONCLUÍDO   | TLS, autenticação e SELECT 1 aprovados                                                               |
| Migrations               | BLOQUEADO   | Oito já aplicadas com checksum correto; zero aplicadas nesta execução; drift detalhado pendente      |
| API NestJS em produção   | PENDENTE    | Bloqueios deliberados preservados até configuração e testes seguros                                  |
| Front-end React/Vite     | EM EXECUÇÃO | Build local passou; API/proxy de produção pendentes                                                  |
| GitHub e CI/CD           | EM EXECUÇÃO | `main` sincronizada ao iniciar; workflow Quality existe; políticas e execução remota não verificadas |
| Deploy Preview           | PENDENTE    | Exige banco/Auth isolados e acesso à Vercel                                                          |
| Testes de integração     | PENDENTE    | Não executar scripts de fixtures contra produção                                                     |
| Domínio definitivo       | PENDENTE    | Associação e disponibilidade não verificadas                                                         |
| Testes finais            | PENDENTE    | Requer deployment real                                                                               |
| Documentação             | EM EXECUÇÃO | Diagnóstico e retomada registrados; atualizar após cada etapa                                        |

## Diagnóstico do código

- Monorepo npm: `apps/web`, `apps/api`, `packages/shared`. Web e API dependem do build de shared.
- Node instalado 24.22.1 / npm 11.19.1. Manifests: React 19.3.1, Vite 8.3.5, NestJS 12.2.0, Prisma e adapter-pg 7.10.1. Nenhuma dependência alterada.
- Git: remoto `ViniciusSantosbit/VympaConnect`, branch `main`, commit inicial `c368811`; árvore limpa ao iniciar. Visibilidade privada e proteções de branch ainda não confirmadas.
- Auth real via Supabase; sessões opacas em cookies HttpOnly, Secure em HTTPS, SameSite Strict e prefixo `__Host-`; tokens criptografados no banco. CSRF valida origem e token, guards globais exigem MFA `aal2` e perfil administrativo ativo, RolesGuard controla papéis. Há auditoria e revogação. Isso comprova implementação, não validação de login/MFA em produção.
- Bloqueio genérico de `NODE_ENV=production` substituído por requisitos explícitos de projeto, runtime restrito, segredos, CORS e HTTPS. Modos local/isolated continuam impedidos de selecionar o projeto principal. Testes negativos adicionados.
- `loadDatabaseEnvironment` preserva isolamento por arquivos no desenvolvimento; em produção exige variáveis injetadas e recusa fallback para arquivos locais.
- PostgreSQL runtime usa PrismaPg; CLI usa `prisma.config.ts`. O Supabase atual está limitado ao Session pooler do projeto `qxuqxonpgundilvnajtl`, porta 5432, TLS obrigatório. Identificador encontrado na configuração não equivale a identidade validada na conta.
- Rate limit global e por rota usa memória em desenvolvimento e armazenamento PostgreSQL transacional em produção; testes unitários passaram, integração real com papel runtime ainda pendente.
- API mantém `/api/v1`. Health público é liveness, não readiness contínuo do banco.
- Gemini usa SDK no servidor, timeout e ferramentas de consulta. Google Places e Geoapify possuem implementação, mas ambos estão desativados na configuração local. Não ativar consumo pago sem aprovação.
- Não identificados workers/filas/cron ativos na composição da API. Redis no Compose é opcional. Uploads e downloads de contratos chamam `ContractDocumentsService.blocked`: estão deliberadamente indisponíveis no código atual. Metadados não equivalem a armazenamento funcional; preservar o bloqueio até integração privada autorizada.
- README e documentos de arquitetura/segurança/banco ainda descrevem a fundação. Scripts 00/01 estão documentados nominalmente; não há documentação nominal 02–09 nem Script 10 anterior em `docs`.

## Estratégia a executar após desbloqueio

Fluxo pretendido: navegador HTTPS → Vercel Web → rewrite `/api/v1` → Vercel API NestJS → Supabase PostgreSQL. API → Supabase Auth / Gemini / provedor de prospecção autorizado. Nenhum segredo de banco ou integração no navegador.

Dois projetos: Web `vympaconnect`, root `apps/web`; API com nome e domínio a confirmar, root `apps/api`. Manter Node 24 e instalação npm com lockfile na raiz. Web já compila shared antes de Vite; API precisa compilar shared, gerar Prisma Client e compilar NestJS. Sem migrations no build.

A Vercel documenta suporte nativo ao entrypoint `src/main.ts` do NestJS. Não há necessidade demonstrada de reescrever a API. Ajustar carregamento de ambiente, porta/host e validar build/artefatos reais. Separar conexão de runtime com pooling e papel restrito da conexão de release/migrations com sessão estável. A escolha final depende da inspeção do destino e dos privilégios/RLS; conexão Prisma não aplica automaticamente identidade Supabase Auth.

Preview deve usar banco/Auth isolados. Não apontar Preview para produção. No Web, permitir API relativa `/api/v1` com validação explícita: o cliente atual exige URL absoluta. Criar rewrite para o domínio de API efetivamente validado, antes do fallback SPA. Cookies devem continuar no domínio do painel pelo proxy.

Arquivos candidatos a alteração: `apps/api/src/config/{environment,database-environment,configure-app}.ts`, `apps/api/src/modules/auth/auth-config.ts`, `apps/api/prisma.config.ts`, scripts de banco/release, configuração de throttling, `apps/api/vercel.json`, `apps/web/vercel.json`, `apps/web/src/services/http.ts`, testes correspondentes e workflow de release. Não alterar migrations já aplicadas.

CLI `vercel` e `gh` não encontradas no PATH; `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `GH_TOKEN` e `GITHUB_TOKEN` ausentes no processo consultado. Não há vínculo `.vercel/project.json` na raiz nem auth da CLI no caminho APPDATA consultado. A sessão do navegador ainda não foi verificada; esses achados não provam ausência de acesso pela conta.

## Migrations e recuperação

Histórico em ordem: foundation, administrative_auth, prospecting, geoapify_references, finance, clients_contracts, goals, ai_chat. Oito migrations definem 39 tabelas. SQL contém criação de schemas/tipos/tabelas/índices/constraints, RLS e revogações; amplia `place_id` e adiciona relações. Finance insere catálogo e categorias estruturais, não clientes fictícios. Não encontrados DROP/TRUNCATE/DELETE ou UPDATE de dados na revisão inicial. Constraints novas ainda podem falhar com dados existentes; verificar drift e dados antes de aplicar.

Não foram verificados backups, checksums remotos, contagens, privilégios ou migrations pendentes, pois a autenticação falhou. Não utilizar reset, db push, migrate dev ou resolve para forçar o destino. Aplicação futura deve usar migrate deploy com destino explícito e credencial de release, fora do build/Preview.

Rollback da aplicação: redeploy/promover deployment anterior validado na Vercel; identificadores ainda pendentes. Banco: backup lógico criptografado e/ou recuperação nativa disponível no plano existente, com teste de restauração isolado antes de alterações. Reverter aplicação não reverte migrations. Não habilitar PITR ou plano pago automaticamente.

## Operação e troubleshooting

- Build: instalar pela raiz com lockfile, compilar shared e gerar Prisma antes da API. Não executar builds concorrentes que removem o mesmo `dist`.
- Supabase `28P01`: conferir senha atual e codificar somente a senha na URI. Erros TLS: corrigir CA/hostname, nunca desativar validação.
- Migration: interromper diante de drift, histórico divergente ou dados incompatíveis; preservar SQL e banco.
- 401: sessão/identidade; 403: MFA, perfil, papel ou CSRF. Nunca remover guards para contornar.
- 404 após refresh: fallback SPA deve vir depois de `/api/v1` e assets.
- CORS/cookies: origem HTTPS exata, sem wildcard, proxy e cookies no domínio correto.
- Gemini: chave exclusivamente na API, modelo válido, timeout/quota; não atribuir ferramentas de escrita à IA.
- API não inicializa: verificar configuração e readiness do banco, usando diagnóstico sanitizado.

CI atual valida qualidade em PostgreSQL de serviço; não possui release de produção. Configurar release controlado somente de branch aprovada e environment protegido, com credencial de migration separada; não adicionar secrets ao Git. Validar que falha de testes impede promoção antes de habilitar integração de produção automática.

## Referências oficiais consultadas

- [NestJS na Vercel](https://vercel.com/docs/frameworks/backend/nestjs)
- [Prisma no Supabase](https://supabase.com/docs/guides/database/prisma)
- [Conexões PostgreSQL Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)

Resultados locais desta execução são registrados em `validation.md`.

## Continuidade — acesso Vercel confirmado

A sessão do navegador integrado está autenticada na equipe `vinicius-santos-projects-bb2d4523`. O repositório GitHub foi reconhecido na importação. Formulário Web preparado com nome `vympaconnect`, root `apps/web`, preset Vite. Nenhum projeto/deployment foi criado e a disponibilidade do domínio ainda não foi confirmada. Não clicar Deploy enquanto os bloqueios de produção persistirem.

Cliente Web adaptado para URL relativa exata `/api/v1`, com fallback same-origin em produção e recusa de HTTP, loopback, credenciais, query e fragment na URL produtiva. A URL local explícita do `.env` foi preservada; configurar VITE_API_URL na Vercel. Rewrite com destino real da API ainda pendente.

Próxima intervenção: usuário autenticar no painel Supabase do projeto qxuqxonpgundilvnajtl no navegador integrado. A aba foi aberta e mostrou login; não há sessão Cloud nessa superfície. Após Avançar, verificar a identidade do projeto, obter/configurar somente credenciais Auth necessárias sem imprimi-las, validar provedores e redirects, preparar configuração produtiva fail-closed e isolamento Preview. Não copiar credenciais Auth locais nem criar OWNER fictício.

## Bloqueio de acesso ao painel Supabase

Login via GitHub no navegador integrado realizado. Conta visível: ViniciusSantosbit; organização arvjeakotjlcxnvnzmxt. A lista dessa organização mostra somente melonwallet (kffrtelbeqpgiakgsehu) e Techedin (hvuprzgcxkirpgftnohx). O acesso direto ao projeto qxuqxonpgundilvnajtl retornou à lista de organizações. Portanto a conta autenticada não demonstrou acesso administrativo ao projeto VYMPA. Não configurar Auth em outro projeto nem reutilizar chaves desses dois projetos. Conexão PostgreSQL validada anteriormente continua sendo evidência distinta de acesso ao painel.

Próxima ação humana: autenticar no navegador integrado com a conta que possui acesso ao projeto qxuqxonpgundilvnajtl e deixar o painel desse projeto aberto; depois responder Avançar. Não solicitar senhas ou tokens no chat. A API não foi publicada e nenhuma alteração remota foi efetuada nesta retomada.

## Acesso correto e preparação produtiva

Conta atual agora demonstra acesso à organização vympa-connect-prod (tclvnezysecaeryrjdxo), projeto vympa-connect-admin / qxuqxonpgundilvnajtl. Bloqueio de conta anterior resolvido. Auth Cloud: cadastro público e anônimo desativados, confirmação de e-mail ativa, e-mail habilitado, TOTP habilitado e limite AAL1 ativo. Nenhuma dessas configurações precisou ser alterada. URLs de Auth ainda usam localhost e não possuem redirects: só configurar domínio definitivo após confirmar associação real na Vercel.

Chaves Auth Cloud já existentes lidas e armazenadas em apps/api/.env.production.local, ignorado pelo Git; endpoints settings e admin/users retornaram HTTP 200. Chave de criptografia de sessões nova, exclusiva de produção, gerada localmente. Não copiar esse arquivo para o Web, Git ou Preview. Nenhuma chave nova criada na conta.

Código preparado: carregamento de produção exclusivamente por variáveis injetadas; seleção explícita do banco/project ref; runtime exige papel vympa_runtime e transaction pooler 6543 com TLS; Preview com o projeto de produção é recusado; Auth produtivo exige projeto confirmado, HTTPS e segredos; CORS com origem única; debug/trace e break-glass recusados. Prisma CLI remoto permanece bloqueado: não havia migrations pendentes. API Vercel usa preset NestJS, build shared + Prisma + API sem migrations. Rate limit produtivo usa PostgreSQL e advisory lock em transação, com contadores hash em system_metadata e sem fallback em memória. Privilégios/políticas do papel runtime ainda precisam ser provisionados e testados antes de iniciar API.

Importante: adicionar política RLS restrita ao papel runtime nas tabelas autorizadas, sem conceder acesso a anon/authenticated, auth/storage ou histórico de migrations. Não usar postgres como credencial runtime. Retenção dos contadores rate: exige procedimento de limpeza apenas das chaves rate expiradas antes de operação prolongada; não apagar metadados de outro prefixo.

Bootstrap produtivo preparado em apps/api/scripts/bootstrap-production-owner.mjs, NÃO EXECUTADO. Exige UUID explícito, confirmação literal, identidade Auth existente com e-mail confirmado, nenhum perfil prévio e transação serializável com lock e auditoria. Não cria identidade, não define senha, não elimina exigência MFA. Só executar após confirmar com o usuário qual identidade deve receber OWNER.

Intervenção atual: formulário Authentication > Users > Add user > Create new user aberto, sem valores preenchidos. Usuário deve cadastrar sua identidade real e definir a senha diretamente no Supabase. Isso cria a identidade Auth, mas ainda não dá acesso administrativo ao VYMPA: após Avançar, conferir identidade e autorização OWNER antes do bootstrap. Não publicar até concluir runtime restrito, Preview isolado, MFA real e demais testes de aceite.

## Retomada — OWNER, runtime e Vercel provisionados

Usuário autorizou explicitamente o vínculo da identidade real como primeiro OWNER, após bloqueio da revisão automática. Bootstrap executado: um perfil OWNER ativo e um evento PRODUCTION_OWNER_BOOTSTRAPPED confirmados. Nenhuma senha foi lida ou definida pelo agente. MFA ainda sem validação de login real.

Usuário também autorizou explicitamente o papel runtime e o escopo das 39 tabelas. Provisionamento executado após backup criptografado: vympa_runtime sem superuser/createdb/createrole/bypassrls; SELECT/INSERT/UPDATE/DELETE nas 38 tabelas privadas e SELECT/INSERT/UPDATE em system_metadata; políticas RLS limitadas a esse papel. Sem USAGE em auth/storage e sem UPDATE em _prisma_migrations, confirmados em conexão transaction pooler 6543. Nenhuma tabela de aplicação apagada ou substituída.

Backup em apps/api/.env.production-backup; chave separada em apps/api/.env.backup-recovery.local. Ambos ignorados pelo Git. Exportação pg_dump custom dos schemas public e vympa_private criptografada com AES-256-GCM; descriptografia e pg_restore --list aprovados. Restauração completa em ambiente descartável ainda não testada. Nunca enviar a chave de recuperação ao runtime Vercel.

Verificação real apps/api/scripts/verify-production-runtime.mjs passou: Prisma Client conectado com papel restrito, isolamento auth/storage, contador compartilhado entre duas instâncias do storage e escrita de sondagem revertida por rollback. Script audit-production-database.mjs substitui o diagnóstico temporário da raiz.

CLI oficial Vercel 65.8.0 vinculada com autorização expressa do usuário; whoami confirmou viniciussantosbit. Dois projetos vazios criados na equipe vinicius-santos-projects-bb2d4523, sem vincular Git nem publicar deployments: Web vympaconnect (prj_VogFeNkQlalDsZke1fe4FiEIds7K), API vympaconnect-api (prj_rjfumEu06R0ONitVsfZ765hDrWOm). Roots apps/web e apps/api, presets Vite/NestJS, Node 24.x, publicSource=false. Domínio vympaconnect.vercel.app verificado e associado ao projeto Web pela API Vercel. Ainda não comprova HTTPS ou site funcional, pois nenhum deployment existe.

Próxima intervenção: criar projeto Supabase gratuito vympa-connect-preview, isolado do banco/Auth produtivo, para cumprir Preview sem escrita em produção. Formulário preparado na organização vympa-connect-prod (Free), nome definido e exposição automática de tabelas desmarcada. Senha não preenchida; o usuário precisa defini-la diretamente e criar o projeto. Após Avançar: identificar ref/região reais, obter credenciais desse Preview sem imprimir valores, preparar loaders para esse destino isolado (código atual recusa projeto produtivo no Preview), aplicar migrations somente nesse novo destino validado, criar identidade de validação controlada, configurar variáveis Preview e deployment. Só publicar produção após controles/fluxos reais passarem.
