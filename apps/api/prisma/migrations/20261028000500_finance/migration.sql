BEGIN;
CREATE TYPE "vympa_private"."ProposalStatus" AS ENUM ('DRAFT','PREPARED','SENT','ACCEPTED','REJECTED','EXPIRED');
CREATE TYPE "vympa_private"."FinancialType" AS ENUM ('INCOME','EXPENSE');
CREATE TYPE "vympa_private"."FinancialStatus" AS ENUM ('PLANNED','PENDING','SETTLED','CANCELLED');
CREATE TYPE "vympa_private"."FinancialGroup" AS ENUM ('GENERAL','AI','INFRA','INVESTMENT');
CREATE TYPE "vympa_private"."InvestmentStatus" AS ENUM ('PLANNED','APPROVED','PAID','CANCELLED');
CREATE TABLE "vympa_private"."service_offerings" (
"id" UUID NOT NULL PRIMARY KEY,
"code" VARCHAR(40) NOT NULL,
"name" VARCHAR(180) NOT NULL,
"description" VARCHAR(3000) NOT NULL,
"baseCents" INTEGER,
"setupCents" INTEGER,
"monthlyCents" INTEGER,
"operatingCents" INTEGER,
"active" BOOLEAN NOT NULL DEFAULT true,
"notes" VARCHAR(3000),
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."service_offerings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."service_offerings" FROM PUBLIC;
CREATE TABLE "vympa_private"."service_price_versions" (
"id" UUID NOT NULL PRIMARY KEY,
"offeringId" UUID NOT NULL,
"version" INTEGER NOT NULL,
"snapshot" JSONB NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "vympa_private"."service_price_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."service_price_versions" FROM PUBLIC;
CREATE TABLE "vympa_private"."discount_policies" (
"id" VARCHAR(32) NOT NULL DEFAULT 'default' PRIMARY KEY,
"rules" JSONB NOT NULL,
"provisional" BOOLEAN NOT NULL DEFAULT true,
"version" INTEGER NOT NULL DEFAULT 1,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."discount_policies" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."discount_policies" FROM PUBLIC;
CREATE TABLE "vympa_private"."proposals" (
"id" UUID NOT NULL PRIMARY KEY,
"companyName" VARCHAR(180) NOT NULL,
"segment" "vympa_private"."LeadSegment" NOT NULL,
"leadId" UUID,
"responsibleId" UUID NOT NULL,
"createdById" UUID NOT NULL,
"status" "vympa_private"."ProposalStatus" NOT NULL DEFAULT 'DRAFT',
"version" INTEGER NOT NULL DEFAULT 1,
"simulationDate" DATE NOT NULL,
"input" JSONB NOT NULL,
"result" JSONB NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."proposals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."proposals" FROM PUBLIC;
CREATE TABLE "vympa_private"."proposal_versions" (
"id" UUID NOT NULL PRIMARY KEY,
"proposalId" UUID NOT NULL,
"version" INTEGER NOT NULL,
"snapshot" JSONB NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "vympa_private"."proposal_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."proposal_versions" FROM PUBLIC;
CREATE TABLE "vympa_private"."financial_categories" (
"id" UUID NOT NULL PRIMARY KEY,
"name" VARCHAR(100) NOT NULL,
"group" "vympa_private"."FinancialGroup" NOT NULL DEFAULT 'GENERAL',
"active" BOOLEAN NOT NULL DEFAULT true,
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."financial_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."financial_categories" FROM PUBLIC;
CREATE TABLE "vympa_private"."financial_transactions" (
"id" UUID NOT NULL PRIMARY KEY,
"requestKey" VARCHAR(100) NOT NULL,
"description" VARCHAR(250) NOT NULL,
"type" "vympa_private"."FinancialType" NOT NULL,
"amountCents" INTEGER NOT NULL,
"competenceOn" DATE NOT NULL,
"dueOn" DATE,
"settledOn" DATE,
"status" "vympa_private"."FinancialStatus" NOT NULL,
"categoryId" UUID NOT NULL,
"categoryGroup" "vympa_private"."FinancialGroup" NOT NULL,
"counterparty" VARCHAR(180),
"serviceReference" VARCHAR(180),
"paymentMethod" VARCHAR(100),
"notes" VARCHAR(3000),
"createdById" UUID NOT NULL,
"recurringId" UUID,
"recurrencePeriod" VARCHAR(7),
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."financial_transactions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."financial_transactions" FROM PUBLIC;
CREATE TABLE "vympa_private"."recurring_transactions" (
"id" UUID NOT NULL PRIMARY KEY,
"description" VARCHAR(250) NOT NULL,
"amountCents" INTEGER NOT NULL,
"categoryId" UUID NOT NULL,
"dueDay" INTEGER NOT NULL,
"startsOn" DATE NOT NULL,
"endsOn" DATE,
"supplier" VARCHAR(180),
"notes" VARCHAR(3000),
"active" BOOLEAN NOT NULL DEFAULT true,
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."recurring_transactions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."recurring_transactions" FROM PUBLIC;
CREATE TABLE "vympa_private"."investments" (
"id" UUID NOT NULL PRIMARY KEY,
"name" VARCHAR(180) NOT NULL,
"description" VARCHAR(3000),
"estimatedCents" INTEGER NOT NULL,
"actualCents" INTEGER,
"priority" VARCHAR(10) NOT NULL,
"status" "vympa_private"."InvestmentStatus" NOT NULL DEFAULT 'PLANNED',
"plannedOn" DATE NOT NULL,
"categoryId" UUID NOT NULL,
"responsibleId" UUID NOT NULL,
"transactionId" UUID,
"notes" VARCHAR(3000),
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."investments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."investments" FROM PUBLIC;
CREATE TABLE "vympa_private"."ai_costs" (
"id" UUID NOT NULL PRIMARY KEY,
"provider" VARCHAR(100) NOT NULL,
"modelService" VARCHAR(180) NOT NULL,
"amountCents" INTEGER NOT NULL,
"period" VARCHAR(7) NOT NULL,
"projectReference" VARCHAR(180),
"unit" VARCHAR(80),
"quantity" VARCHAR(80),
"notes" VARCHAR(3000),
"transactionId" UUID,
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."ai_costs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."ai_costs" FROM PUBLIC;
CREATE TABLE "vympa_private"."financial_opening_balances" (
"id" VARCHAR(32) NOT NULL DEFAULT 'default' PRIMARY KEY,
"amountCents" INTEGER NOT NULL,
"effectiveOn" DATE NOT NULL,
"version" INTEGER NOT NULL DEFAULT 1,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "vympa_private"."financial_opening_balances" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."financial_opening_balances" FROM PUBLIC;
CREATE TABLE "vympa_private"."finance_audit_events" (
"id" UUID NOT NULL PRIMARY KEY,
"actorId" UUID NOT NULL,
"action" VARCHAR(80) NOT NULL,
"entityId" VARCHAR(100) NOT NULL,
"before" JSONB,
"after" JSONB NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "vympa_private"."finance_audit_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."finance_audit_events" FROM PUBLIC;
CREATE UNIQUE INDEX "service_offerings_code_key" ON "vympa_private"."service_offerings" ("code");
CREATE UNIQUE INDEX "service_price_versions_offeringId_version_key" ON "vympa_private"."service_price_versions" ("offeringId","version");
ALTER TABLE "vympa_private"."service_price_versions" ADD CONSTRAINT "service_price_versions_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "vympa_private"."service_offerings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "proposals_status_updatedAt_idx" ON "vympa_private"."proposals" ("status","updatedAt");
CREATE INDEX "proposals_leadId_idx" ON "vympa_private"."proposals" ("leadId");
CREATE INDEX "proposals_responsibleId_idx" ON "vympa_private"."proposals" ("responsibleId");
ALTER TABLE "vympa_private"."proposals" ADD CONSTRAINT "proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "vympa_private"."leads" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."proposals" ADD CONSTRAINT "proposals_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."proposals" ADD CONSTRAINT "proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "proposal_versions_proposalId_version_key" ON "vympa_private"."proposal_versions" ("proposalId","version");
ALTER TABLE "vympa_private"."proposal_versions" ADD CONSTRAINT "proposal_versions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "vympa_private"."proposals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "financial_categories_name_key" ON "vympa_private"."financial_categories" ("name");
CREATE UNIQUE INDEX "financial_transactions_requestKey_key" ON "vympa_private"."financial_transactions" ("requestKey");
CREATE UNIQUE INDEX "financial_transactions_recurringId_recurrencePeriod_key" ON "vympa_private"."financial_transactions" ("recurringId","recurrencePeriod");
CREATE INDEX "financial_transactions_status_settledOn_type_idx" ON "vympa_private"."financial_transactions" ("status","settledOn","type");
CREATE INDEX "financial_transactions_competenceOn_categoryId_idx" ON "vympa_private"."financial_transactions" ("competenceOn","categoryId");
CREATE INDEX "financial_transactions_dueOn_status_idx" ON "vympa_private"."financial_transactions" ("dueOn","status");
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "financial_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vympa_private"."financial_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "financial_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "financial_transactions_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "vympa_private"."recurring_transactions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."recurring_transactions" ADD CONSTRAINT "recurring_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vympa_private"."financial_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "investments_transactionId_key" ON "vympa_private"."investments" ("transactionId");
CREATE INDEX "investments_status_plannedOn_idx" ON "vympa_private"."investments" ("status","plannedOn");
ALTER TABLE "vympa_private"."investments" ADD CONSTRAINT "investments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vympa_private"."financial_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."investments" ADD CONSTRAINT "investments_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."investments" ADD CONSTRAINT "investments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "vympa_private"."financial_transactions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ai_costs_transactionId_key" ON "vympa_private"."ai_costs" ("transactionId");
CREATE INDEX "ai_costs_period_idx" ON "vympa_private"."ai_costs" ("period");
ALTER TABLE "vympa_private"."ai_costs" ADD CONSTRAINT "ai_costs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "vympa_private"."financial_transactions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "finance_audit_events_entityId_createdAt_idx" ON "vympa_private"."finance_audit_events" ("entityId","createdAt");
CREATE INDEX "finance_audit_events_actorId_createdAt_idx" ON "vympa_private"."finance_audit_events" ("actorId","createdAt");
ALTER TABLE "vympa_private"."finance_audit_events" ADD CONSTRAINT "finance_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "entry_amount_positive" CHECK ("amountCents" > 0 AND "amountCents" <= 1000000000), ADD CONSTRAINT "entry_settlement_consistent" CHECK ((status='SETTLED' AND "settledOn" IS NOT NULL) OR (status<>'SETTLED' AND "settledOn" IS NULL));
ALTER TABLE "vympa_private"."service_offerings" ADD CONSTRAINT "service_prices_nonnegative" CHECK (COALESCE("baseCents",0)>=0 AND COALESCE("setupCents",0)>=0 AND COALESCE("monthlyCents",0)>=0 AND COALESCE("operatingCents",0)>=0);
ALTER TABLE "vympa_private"."recurring_transactions" ADD CONSTRAINT "recurring_values_valid" CHECK ("amountCents">0 AND "dueDay" BETWEEN 1 AND 31 AND ("endsOn" IS NULL OR "endsOn">="startsOn"));
ALTER TABLE "vympa_private"."investments" ADD CONSTRAINT "investment_values_valid" CHECK ("estimatedCents">=0 AND COALESCE("actualCents",0)>=0 AND (status<>'PAID' OR "transactionId" IS NOT NULL));
ALTER TABLE "vympa_private"."ai_costs" ADD CONSTRAINT "ai_amount_valid" CHECK ("amountCents">=0);
INSERT INTO "vympa_private"."service_offerings" (id,code,name,description,"updatedAt") VALUES (gen_random_uuid(),'CUSTOM_AI','Sistema personalizado + IA','Sistema independente com identidade do cliente, banco, APIs autorizadas, assistente de IA, manutenção e suporte.',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."service_offerings" (id,code,name,description,"updatedAt") VALUES (gen_random_uuid(),'DOCUMENT_AUTOMATION','Automação de documentos','Organização, extração, classificação, aprovações, integrações, relatórios e OCR quando aplicável.',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."service_offerings" (id,code,name,description,"updatedAt") VALUES (gen_random_uuid(),'SECTOR_PROCESSES','Gestão de processos por setor','Atividades, responsáveis, prazos, status, relatórios, permissões e fluxos por setor.',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."service_offerings" (id,code,name,description,"updatedAt") VALUES (gen_random_uuid(),'AI_INTEGRATION','Implementação de IA','Assistentes, análise de documentos e automação com integrações autorizadas.',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Receitas de serviços','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Hospedagem','INFRA',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Banco de dados','INFRA',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Inteligência artificial','AI',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'APIs','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Infraestrutura','INFRA',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Domínios','INFRA',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Ferramentas de desenvolvimento','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Marketing','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Serviços profissionais','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Administrativo','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Outras despesas','GENERAL',CURRENT_TIMESTAMP);
INSERT INTO "vympa_private"."financial_categories" (id,name,"group","updatedAt") VALUES (gen_random_uuid(),'Investimentos','INVESTMENT',CURRENT_TIMESTAMP);
COMMIT;
