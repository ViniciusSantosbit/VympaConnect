# Banco e migrations

PostgreSQL 18 no Compose. O volume usa /var/lib/postgresql conforme a organização da imagem 18. Porta vinculada somente ao loopback. Credenciais de exemplo são exclusivas de desenvolvimento.

Prisma 7 usa prisma.config.ts para a URL da CLI e PrismaPg para o runtime. O client é gerado em src/generated/prisma, ignorado no Git. Rodar npm run db:generate após npm ci, e antes de compilar. Build e typecheck já fazem isso.

API e CLI carregam somente `apps/api/.env`, por caminho relativo ao arquivo de implementação; o `.env` raiz pertence ao Compose. Ambiente do processo prevalece. A CLI não possui fallback de conexão: sem DATABASE_URL, geração/validação continuam disponíveis e comandos de migration são recusados antes de conectar. Nunca usar URL remota para a validação local.

A migration 20261026000100_foundation cria somente system_metadata, com UUID, chave única, valor e timestamps. A checagem npm run db:check usa upsert da chave técnica foundation e valida leitura/escrita. Requer build prévio e migration aplicada. Não apaga dados.

## Comandos

- npm run db:up: inicia PostgreSQL.
- npm run db:migrate -- --name nome: preferir npm run db:migrate -w @vympa/api -- --name nome para passar argumentos diretamente ao workspace.
- npm run db:deploy: aplica migrations existentes.
- npm run db:check: verifica Prisma e persistência.
- npm run db:down: encerra containers, preservando volumes.

Nunca substituir migrations por db push. Revisar SQL, testar em banco descartável e preparar backup antes de mudanças destrutivas. Não rodar migrate dev em produção.

## Modelagem planejada, ainda não implementada

| Tabela                 | Relacionamentos e decisões futuras                                    |
| ---------------------- | --------------------------------------------------------------------- |
| users                  | Administradores, papéis, MFA e sessões em tabelas próprias            |
| leads                  | Responsável users; origem, segmento, localização e status             |
| lead_interactions      | N:1 leads e N:1 users; histórico cronológico                          |
| clients                | Conversão rastreável a partir de leads; contatos separados            |
| operations             | Catálogo editável; associação N:N com clients via contratos           |
| proposals              | Lead/cliente, itens de operação e versão da política de desconto      |
| contracts              | Cliente, proposta, vigência de 3/6 meses; revisões e aprovação humana |
| financial_transactions | Cliente/contrato opcionais, categoria, moeda e competência            |
| goals                  | Administrador/equipe, período, unidade e valor alvo                   |
| goal_progress          | N:1 goals; eventos de progresso e autoria                             |
| ai_usage               | Usuário, finalidade, provedor, tokens, custo e correlação             |
| audit_logs             | Ator, ação, recurso, instante, correlação e contexto sanitizado       |

Valores monetários usarão Decimal com precisão explícita; timestamps serão UTC; filtros e índices serão definidos por consultas reais. Arquivos de contratos armazenarão apenas metadados e chaves privadas, nunca bytes no banco. Definir retenção, exclusão lógica e escopo de acesso antes de receber dados.
