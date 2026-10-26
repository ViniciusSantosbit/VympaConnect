# Arquitetura

VYMPA Connect é um monólito modular: um único processo API, um frontend e um banco PostgreSQL. Não há microsserviços. O pacote shared contém contratos públicos, schemas Zod e constantes; nunca credenciais, entidades Prisma ou dependências NestJS.

## Backend

Fluxo: Controller → Service → DatabaseService. Repositories serão adicionados onde houver regras de domínio ou necessidade de isolamento de persistência. DTOs usam class-validator e class-transformer; ValidationPipe rejeita campos extras. Guards aplicarão autenticação e RBAC. Cada domínio terá seu Module quando sua primeira funcionalidade existir. Somente Health tem módulo funcional agora. Não há endpoints comerciais.

ConfigModule valida ambiente antes de iniciar. DatabaseService usa Prisma 7 e adapter pg, conecta e executa SELECT 1 no bootstrap. Falha de banco impede inicialização. Health é liveness e não reconsulta o banco após o bootstrap. Pino recebe logs com IDs gerados no servidor; não registra corpos, cookies, autorização ou query strings. O filtro retorna mensagens internas genéricas.

## Frontend

app concentra providers e rotas; features organiza componentes e lógica de cada domínio; components/ui contém os componentes shadcn/ui de código local (Radix para comportamento acessível); layout define navegação responsiva; shared recebe apenas elementos reutilizados. Aliases @/ são resolvidos por Vite e TypeScript.

TanStack Query é responsável pelo estado do servidor. Zustand fica reservado a estado global local futuro; não duplica caches HTTP ou armazena tokens. React Hook Form + Zod ficam disponíveis para formulários futuros. Axios tem timeout e notificação genérica de erro. Não há login nem sessão falsa.

## Padrões

TypeScript strict e noUncheckedIndexedAccess; identificadores em inglês, textos e documentação em português brasileiro. Imports ESM com extensão .js no backend e no shared. Não usar any para contornar tipagem. Não retornar modelos de persistência diretamente. Usar migrations versionadas. Evitar reexports que criem ciclos e dependências entre domínios sem contrato explícito. API não importa web; shared não importa apps.

## Módulos futuros

| Domínio          | Responsabilidade                                   |
| ---------------- | -------------------------------------------------- |
| auth / users     | Identidade administrativa, MFA, sessões e RBAC     |
| dashboard        | Agregação de indicadores autorizados               |
| prospecting      | Descoberta via Google Places e filtros geográficos |
| crm              | Leads, contatos, negociações e interações          |
| finance          | Fluxo de caixa, receitas, despesas e custos        |
| proposals        | Simulador, descontos editáveis e propostas         |
| operations       | Catálogo das quatro operações VYMPA                |
| goals            | Metas e progresso compartilhado                    |
| clients          | Clientes e operações contratadas                   |
| contracts        | Documentos privados, prazos e aprovação humana     |
| ai               | Assistente interno e consumo controlado            |
| notifications    | Notificações, filas e eventos futuros              |
| settings / audit | Parâmetros, permissões e trilha de auditoria       |

Simulador futuro: descontos a partir de 10%; exemplo de 14% sobre R$ 10.000/mês será requisito de negócio da próxima implementação. Nenhum cálculo comercial foi antecipado.

## Referências verificadas em 26/10/2026

- [NestJS 12 e migração](https://docs.nestjs.com/migration-guide)
- [Prisma 7: ESM, configuração e adapters](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Vite: requisitos Node](https://vite.dev/guide/)
- [Tailwind CSS com Vite](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui: instalação manual](https://ui.shadcn.com/docs/installation/manual)
- [PostgreSQL no Docker: diretório de volume](https://hub.docker.com/_/postgres)
- [GitHub Actions: checkout](https://github.com/actions/checkout)
- [GitHub Actions: setup-node](https://github.com/actions/setup-node)

As versões efetivamente instaladas estão no lockfile e em docs/requirements/versions.md. TypeScript 6 foi selecionado por compatibilidade com typescript-eslint; Prisma 8 ainda era RC na consulta ao npm. Não se usou --force ou --legacy-peer-deps.
