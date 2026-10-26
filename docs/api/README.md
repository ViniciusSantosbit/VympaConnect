# API REST

Base: http://localhost:3000/api/v1
Swagger em desenvolvimento: http://localhost:3000/api/docs
OpenAPI JSON: http://localhost:3000/api/docs-json

GET /api/v1/health retorna HTTP 200:

```json
{ "status": "ok", "service": "vympa-connect-api" }
```

É liveness público: não consulta o banco em cada chamada. A API exige PostgreSQL acessível no bootstrap. Uma queda posterior do banco não altera esse endpoint; readiness com banco fica para a etapa de operação. Não confundir liveness com disponibilidade de persistência.

Helmet, CORS com origens explícitas, ValidationPipe, filtro global e limite de 100 requisições por 60 segundos por IP estão ativos. Não ativar trust proxy irrestrito; revisar proxies confiáveis e armazenagem distribuída do rate limit no deploy. O armazenamento atual do limite é em memória para um processo.

Erros incluem statusCode, message, timestamp e requestId quando disponível. Erros 500 não devolvem stack ou detalhes do banco. CORS protege o navegador, não substitui autenticação. Não existem rotas administrativas nesta etapa.
