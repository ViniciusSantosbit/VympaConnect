# Inventário de ambiente — 30/10/2026

Somente nomes e estados; presença não comprova validade nem autorização para produção. Arquivos existentes foram preservados.

| Arquivo / variável                                     | Serviço / destino               | Classificação            | Estado                                        |
| ------------------------------------------------------ | ------------------------------- | ------------------------ | --------------------------------------------- |
| `.env`: `POSTGRES_USER`                                | Docker / desenvolvimento        | Configuração de servidor | PRESENTE                                      |
| `.env`: `POSTGRES_PASSWORD`                            | Docker / desenvolvimento        | Privada / segredo        | PRESENTE                                      |
| `.env`: `POSTGRES_DB`                                  | Docker / desenvolvimento        | Configuração de servidor | PRESENTE                                      |
| `.env`: `POSTGRES_PORT`                                | Docker / desenvolvimento        | Configuração de servidor | PRESENTE                                      |
| `.env`: `REDIS_PORT`                                   | Docker / desenvolvimento        | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `NODE_ENV`                            | API / infraestrutura            | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `HOST`                                | API / infraestrutura            | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `PORT`                                | API / infraestrutura            | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `DATABASE_URL`                        | API / infraestrutura            | Privada / segredo        | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `CORS_ORIGINS`                        | API / infraestrutura            | Configuração de servidor | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `LOG_LEVEL`                           | API / infraestrutura            | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `GOOGLE_PLACES_API_KEY`               | Prospecção / API                | Privada / segredo        | AUSENTE                                       |
| `apps/api/.env`: `ANTHROPIC_API_KEY`                   | API / infraestrutura            | Privada / segredo        | AUSENTE                                       |
| `apps/api/.env`: `S3_ENDPOINT`                         | API / infraestrutura            | Configuração de servidor | AUSENTE                                       |
| `apps/api/.env`: `S3_REGION`                           | API / infraestrutura            | Configuração de servidor | AUSENTE                                       |
| `apps/api/.env`: `S3_BUCKET`                           | API / infraestrutura            | Configuração de servidor | AUSENTE                                       |
| `apps/api/.env`: `S3_ACCESS_KEY_ID`                    | API / infraestrutura            | Privada / segredo        | AUSENTE                                       |
| `apps/api/.env`: `S3_SECRET_ACCESS_KEY`                | API / infraestrutura            | Privada / segredo        | AUSENTE                                       |
| `apps/api/.env`: `RESEND_API_KEY`                      | API / infraestrutura            | Privada / segredo        | AUSENTE                                       |
| `apps/api/.env`: `EMAIL_FROM`                          | API / infraestrutura            | Configuração de servidor | AUSENTE                                       |
| `apps/api/.env`: `REDIS_URL`                           | API / infraestrutura            | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `AUTH_SESSION_SECRET`                 | Supabase Auth / API             | Privada / segredo        | AUSENTE                                       |
| `apps/api/.env`: `AUTH_ENABLE_BREAK_GLASS`             | Supabase Auth / API             | Configuração de servidor | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `AUTH_ENVIRONMENT`                    | Supabase Auth / API             | Configuração de servidor | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `SUPABASE_AUTH_URL`                   | Supabase Auth / API             | Configuração de servidor | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `SUPABASE_AUTH_PUBLISHABLE_KEY`       | Supabase Auth / API             | Configuração de servidor | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `SUPABASE_AUTH_SECRET_KEY`            | Supabase Auth / API             | Privada / segredo        | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `AUTH_SESSION_ENCRYPTION_KEY`         | Supabase Auth / API             | Privada / segredo        | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `AUTH_WEB_ORIGIN`                     | Supabase Auth / API             | Configuração de servidor | PRESENTE — desenvolvimento; produção pendente |
| `apps/api/.env`: `AUTH_ISOLATED_PROJECT_CONFIRMATION`  | Supabase Auth / API             | Configuração de servidor | AUSENTE                                       |
| `apps/api/.env`: `GOOGLE_PLACES_ENABLED`               | Prospecção / API                | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `GEOAPIFY_API_KEY`                    | Prospecção / API                | Privada / segredo        | PRESENTE                                      |
| `apps/api/.env`: `GEOAPIFY_PLACES_ENABLED`             | Prospecção / API                | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `AI_ENABLED`                          | Gemini / API                    | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env`: `GEMINI_API_KEY`                      | Gemini / API                    | Privada / segredo        | PRESENTE                                      |
| `apps/api/.env`: `GEMINI_MODEL`                        | Gemini / API                    | Configuração de servidor | PRESENTE                                      |
| `apps/web/.env`: `VITE_API_URL`                        | Web / Vercel Web                | Pública                  | PRESENTE — validar produção                   |
| `apps/web/.env`: `VITE_GOOGLE_MAPS_BROWSER_KEY`        | Web / Vercel Web                | Pública                  | AUSENTE                                       |
| `apps/web/.env`: `VITE_GOOGLE_MAPS_ENABLED`            | Web / Vercel Web                | Pública                  | PRESENTE — validar produção                   |
| `apps/web/.env`: `VITE_GOOGLE_MAPS_MAP_ID`             | Web / Vercel Web                | Pública                  | AUSENTE                                       |
| `apps/web/.env`: `VITE_GEOAPIFY_MAPS_KEY`              | Web / Vercel Web                | Pública                  | AUSENTE                                       |
| `apps/api/.env.supabase.local`: `DATABASE_URL`         | PostgreSQL / inspeção e release | Privada / segredo        | PRESENTE — conexão TLS e SELECT 1 aprovados   |
| `apps/api/.env.supabase.local`: `SUPABASE_SSL_CA_FILE` | PostgreSQL / inspeção e release | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env.supabase.local`: `NODE_ENV`             | PostgreSQL / inspeção e release | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env.supabase.local`: `HOST`                 | PostgreSQL / inspeção e release | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env.supabase.local`: `PORT`                 | PostgreSQL / inspeção e release | Configuração de servidor | PRESENTE                                      |
| `apps/api/.env.supabase.local`: `LOG_LEVEL`            | PostgreSQL / inspeção e release | Configuração de servidor | PRESENTE                                      |

`DIRECT_URL` não está configurada nos arquivos inspecionados; separar URL de release da credencial runtime antes da produção. Integrações opcionais ausentes não devem ser copiadas indiscriminadamente. Flags de prospecção locais estão desativadas. A presença de chaves locais não autoriza reaproveitá-las em produção.

## Variáveis produtivas preparadas nesta etapa

Arquivo privado ignorado: apps/api/.env.production.local.

| Nome                          | Serviço / destino        | Classificação                       | Estado                                  |
| ----------------------------- | ------------------------ | ----------------------------------- | --------------------------------------- |
| NODE_ENV                      | API                      | Configuração                        | PRESENTE                                |
| VYMPA_DATABASE_TARGET         | API                      | Configuração                        | PRESENTE                                |
| VYMPA_SUPABASE_PROJECT_REF    | API / Supabase           | Identificador                       | PRESENTE                                |
| AUTH_ENVIRONMENT              | API / Auth               | Configuração                        | PRESENTE                                |
| AUTH_WEB_ORIGIN               | API / Auth               | Origem pública                      | PRESENTE; domínio não associado ainda   |
| CORS_ORIGINS                  | API                      | Origem pública                      | PRESENTE; domínio não associado ainda   |
| SUPABASE_AUTH_URL             | API / Auth               | URL pública                         | PRESENTE                                |
| SUPABASE_AUTH_PUBLISHABLE_KEY | API / Auth               | Chave publicável mantida no backend | PRESENTE; HTTP 200                      |
| SUPABASE_AUTH_SECRET_KEY      | API / Auth               | Privada                             | PRESENTE; HTTP 200                      |
| AUTH_SESSION_ENCRYPTION_KEY   | API / sessões            | Privada                             | PRESENTE; nova e exclusiva              |
| LOG_LEVEL                     | API                      | Configuração                        | PRESENTE                                |
| AUTH_ENABLE_BREAK_GLASS       | API                      | Configuração de segurança           | PRESENTE; desativado                    |
| DATABASE_URL                  | API / PostgreSQL runtime | Privada                             | AUSENTE; provisionar papel restrito     |
| SUPABASE_SSL_CA               | API / TLS                | Certificado público                 | PENDENTE se cadeia exigir CA específica |

Nenhuma dessas variáveis foi enviada à Vercel nesta etapa. Variáveis Gemini/Geoapify de produção ainda pendem de seleção/autorização e configuração. Não utilizar o arquivo produtivo em Preview.

Atualização: DATABASE_URL de runtime PRESENTE e conexão Prisma validada com papel restrito; SUPABASE_SSL_CA PRESENTE e TLS validado. Backup offline usa DATABASE_BACKUP_KEY em .env.backup-recovery.local, sem envio à Vercel. Nenhum segredo foi versionado ou impresso.

Vercel Production (vympaconnect-api): 14 variáveis da whitelist do script configure-vercel-production-env.mjs configuradas e confirmadas como Secret. Credenciais administrativas e de backup excluídas. Preview continua sem credenciais remotas configuradas, aguardando criação do projeto isolado.
