# Integrações futuras

Nenhum SDK externo inicializado, nenhuma chamada real e nenhuma credencial obrigatória nesta etapa. Os contratos TypeScript em apps/api/src/integrations são somente interfaces; implementações deverão ser providers NestJS quando houver recurso autorizado.

## Google Maps / Places

Mapa no navegador usará chave pública restrita por domínio e API. Places será consumido no backend com chave separada, limites, orçamento, filtros e DTOs próprios. Revisar termos de armazenamento e atribuição antes de persistir resultados; não presumir permissão para guardar indefinidamente dados de Places. Não expor chave de servidor como VITE_*.

## IA

Anthropic será chamado apenas no backend, após autorização por usuário/recurso. Minimizar dados enviados, tratar conteúdo externo como não confiável e não dar ferramentas de escrita ao modelo sem controle. Registrar custo e finalidade sem prompts sensíveis. Pré-revisão contratual sempre exige aprovação humana; sem decisões automáticas vinculantes. Aplicar limites de tokens, timeout, orçamento, redaction e política de retenção.

## Contratos privados / S3

Bucket privado, bloqueio de acesso público, criptografia, chaves geradas pelo servidor. Banco guarda proprietário, chave, tamanho, hash, MIME e versão. Autorização antes de emitir URL assinada curta para download; uploads futuros exigirão limites, validação por conteúdo e varredura. Nomes originais não determinam caminhos. Não usar arquivos públicos de frontend ou diretório estático da API.

## Email, filas e tempo real

Email transacional via adapter (ex.: Resend), idempotência e templates revisados. Redis/BullMQ serão opcionais até o primeiro consumidor; retries limitados e dead-letter planejados. Socket.IO exigirá autenticação no handshake, autorização por sala, validação de eventos e política de reconexão. Não há consumers, filas nem WebSockets ativos.

Variáveis estão no .env.example da API, todas opcionais até a implementação. Segredos só no servidor; injetar pelo ambiente do provedor posteriormente.
