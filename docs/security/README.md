# Segurança e limite de uso

Etapa 01 não autorizada para dados reais ou uso produtivo. Não há autenticação, MFA, RBAC ou sessões implementados. NODE_ENV=production é rejeitado deliberadamente. A interface avisa esse estado e não tem login fictício.

## Controles implementados

Helmet, origens CORS explícitas, ValidationPipe global, rate limit, configuração validada, erros internos genéricos, logs sanitizados e PostgreSQL/Redis publicados somente em loopback. .env ignorado; .env.example não contém segredos reais. A API escuta 127.0.0.1 por padrão. Logs não incluem corpos, autorização, cookies ou query strings.

## Próxima etapa obrigatória

Definir administradores e processo de convite, hash Argon2id com parâmetros medidos, MFA TOTP/WebAuthn, recuperação segura e revogação. Sessões opacas com rotação em cookies HttpOnly/Secure/SameSite, expiração absoluta e inatividade; proteção CSRF quando cookies forem usados. Não guardar tokens em localStorage. RBAC com negação padrão e autorização por recurso no backend; não depender da ocultação de links.

Auditoria com ator, ação, recurso e correlação; retenção e acesso restritos. Isolar recursos por regra de domínio. Aprovação humana para contratos e ações de IA. S3 privado e download autorizado conforme docs/integrations. Rotação de segredos, backup testado e restauração antes da produção.

Dependências de JWT/Passport/Argon2 estão preparadas, mas nenhum guard fictício foi criado. Redis e providers externos não são pré-requisito da fundação.

## Deploy posterior

Railway: usar build do monorepo e executar migrations em etapa de release separada. Vercel: root apps/web com configuração de SPA incluída. Não realizar deploy agora. NODE_ENV de produção só poderá ser habilitado após implementar controles e remover conscientemente o bloqueio. HTTPS, cookies, proxies, CORS, logs, limites distribuídos e políticas CSP deverão ser revisados nessa etapa.
