BEGIN;
CREATE TYPE "vympa_private"."ClientStatus" AS ENUM ('PROSPECT','ONBOARDING','ACTIVE','SUSPENDED','INACTIVE');
CREATE TYPE "vympa_private"."ContractStatus" AS ENUM ('DRAFT','PENDING_SIGNATURE','SIGNED','ACTIVE','EXPIRED','TERMINATED','CANCELLED');
CREATE TABLE "vympa_private"."clients" (
"id" UUID NOT NULL PRIMARY KEY,
"companyName" VARCHAR(180) NOT NULL,
"tradeName" VARCHAR(180),
"cnpj" VARCHAR(14),
"segment" "vympa_private"."LeadSegment" NOT NULL,
"email" VARCHAR(254),
"phone" VARCHAR(40),
"website" VARCHAR(500),
"address" VARCHAR(500),
"city" VARCHAR(100),
"state" VARCHAR(2),
"postalCode" VARCHAR(8),
"responsibleId" UUID NOT NULL,
"notes" VARCHAR(3000),
"status" "vympa_private"."ClientStatus" NOT NULL DEFAULT 'PROSPECT',
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "vympa_private"."client_contacts" (
"id" UUID NOT NULL PRIMARY KEY,
"clientId" UUID NOT NULL,
"name" VARCHAR(150) NOT NULL,
"position" VARCHAR(100),
"email" VARCHAR(254),
"phone" VARCHAR(40),
"preferredChannel" VARCHAR(30),
"notes" VARCHAR(1000),
"primary" BOOLEAN NOT NULL DEFAULT false,
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "vympa_private"."client_services" (
"id" UUID NOT NULL PRIMARY KEY,
"clientId" UUID NOT NULL,
"code" VARCHAR(40) NOT NULL,
"status" VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
"notes" VARCHAR(1000),
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "vympa_private"."client_activities" (
"id" UUID NOT NULL PRIMARY KEY,
"clientId" UUID NOT NULL,
"actorId" UUID NOT NULL,
"kind" VARCHAR(50) NOT NULL,
"body" VARCHAR(3000) NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "vympa_private"."contracts" (
"id" UUID NOT NULL PRIMARY KEY,
"requestKey" VARCHAR(100) NOT NULL,
"number" VARCHAR(60) NOT NULL,
"clientId" UUID NOT NULL,
"title" VARCHAR(180) NOT NULL,
"description" VARCHAR(3000),
"responsibleId" UUID NOT NULL,
"startsOn" DATE,
"endsOn" DATE,
"setupCents" INTEGER,
"monthlyCents" INTEGER,
"billingPeriod" VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
"commercialTerms" VARCHAR(3000),
"adjustmentTerms" VARCHAR(3000),
"notes" VARCHAR(3000),
"status" "vympa_private"."ContractStatus" NOT NULL DEFAULT 'DRAFT',
"signatureEvidence" VARCHAR(1000),
"proposalId" UUID,
"proposalSnapshot" JSONB,
"renewedFromId" UUID,
"version" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "vympa_private"."contract_services" (
"id" UUID NOT NULL PRIMARY KEY,
"contractId" UUID NOT NULL,
"code" VARCHAR(40) NOT NULL
);
CREATE TABLE "vympa_private"."contract_documents" (
"id" UUID NOT NULL PRIMARY KEY,
"contractId" UUID NOT NULL,
"name" VARCHAR(180) NOT NULL,
"kind" VARCHAR(10) NOT NULL,
"actorId" UUID NOT NULL,
"storageStatus" VARCHAR(40) NOT NULL DEFAULT 'PENDING_PRIVATE_STORAGE',
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "vympa_private"."contract_amendments" (
"id" UUID NOT NULL PRIMARY KEY,
"contractId" UUID NOT NULL,
"requestKey" VARCHAR(100) NOT NULL,
"previousMonthlyCents" INTEGER NOT NULL,
"monthlyCents" INTEGER NOT NULL,
"effectiveOn" DATE NOT NULL,
"reason" VARCHAR(3000) NOT NULL,
"indexName" VARCHAR(100),
"percentBps" INTEGER,
"documentId" UUID,
"actorId" UUID NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "vympa_private"."contract_history" (
"id" UUID NOT NULL PRIMARY KEY,
"contractId" UUID NOT NULL,
"actorId" UUID NOT NULL,
"kind" VARCHAR(50) NOT NULL,
"reason" VARCHAR(3000) NOT NULL,
"before" JSONB,
"after" JSONB NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "vympa_private"."leads" ADD COLUMN "client_id" UUID;
ALTER TABLE "vympa_private"."financial_transactions" ADD COLUMN "clientId" UUID;
ALTER TABLE "vympa_private"."financial_transactions" ADD COLUMN "contractId" UUID;
ALTER TABLE "vympa_private"."financial_transactions" ADD COLUMN "billingReference" VARCHAR(100);
CREATE UNIQUE INDEX "clients_cnpj_key" ON "vympa_private"."clients" ("cnpj");
CREATE INDEX "clients_status_segment_idx" ON "vympa_private"."clients" ("status","segment");
CREATE INDEX "clients_responsibleId_idx" ON "vympa_private"."clients" ("responsibleId");
CREATE INDEX "client_contacts_clientId_idx" ON "vympa_private"."client_contacts" ("clientId");
CREATE UNIQUE INDEX "client_services_clientId_code_key" ON "vympa_private"."client_services" ("clientId","code");
CREATE INDEX "client_activities_clientId_createdAt_idx" ON "vympa_private"."client_activities" ("clientId","createdAt");
CREATE UNIQUE INDEX "contracts_requestKey_key" ON "vympa_private"."contracts" ("requestKey");
CREATE UNIQUE INDEX "contracts_number_key" ON "vympa_private"."contracts" ("number");
CREATE UNIQUE INDEX "contracts_renewedFromId_key" ON "vympa_private"."contracts" ("renewedFromId");
CREATE UNIQUE INDEX "contracts_id_clientId_key" ON "vympa_private"."contracts" ("id","clientId");
CREATE INDEX "contracts_clientId_status_idx" ON "vympa_private"."contracts" ("clientId","status");
CREATE INDEX "contracts_status_endsOn_idx" ON "vympa_private"."contracts" ("status","endsOn");
CREATE INDEX "contracts_responsibleId_idx" ON "vympa_private"."contracts" ("responsibleId");
CREATE UNIQUE INDEX "contract_services_contractId_code_key" ON "vympa_private"."contract_services" ("contractId","code");
CREATE INDEX "contract_documents_contractId_idx" ON "vympa_private"."contract_documents" ("contractId");
CREATE UNIQUE INDEX "contract_amendments_requestKey_key" ON "vympa_private"."contract_amendments" ("requestKey");
CREATE UNIQUE INDEX "contract_amendments_contractId_effectiveOn_key" ON "vympa_private"."contract_amendments" ("contractId","effectiveOn");
CREATE INDEX "contract_history_contractId_createdAt_idx" ON "vympa_private"."contract_history" ("contractId","createdAt");
CREATE UNIQUE INDEX "financial_transactions_billingReference_key" ON "vympa_private"."financial_transactions" ("billingReference");
ALTER TABLE "vympa_private"."clients" ADD CONSTRAINT "clients_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "vympa_private"."clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."client_services" ADD CONSTRAINT "client_services_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "vympa_private"."clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."client_activities" ADD CONSTRAINT "client_activities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "vympa_private"."clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."client_activities" ADD CONSTRAINT "client_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "vympa_private"."clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contracts" ADD CONSTRAINT "contracts_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contracts" ADD CONSTRAINT "contracts_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "vympa_private"."proposals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contracts" ADD CONSTRAINT "contracts_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "vympa_private"."contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_services" ADD CONSTRAINT "contract_services_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "vympa_private"."contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_documents" ADD CONSTRAINT "contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "vympa_private"."contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_documents" ADD CONSTRAINT "contract_documents_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_amendments" ADD CONSTRAINT "contract_amendments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "vympa_private"."contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_amendments" ADD CONSTRAINT "contract_amendments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "vympa_private"."contract_documents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_amendments" ADD CONSTRAINT "contract_amendments_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_history" ADD CONSTRAINT "contract_history_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "vympa_private"."contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."contract_history" ADD CONSTRAINT "contract_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."leads" ADD CONSTRAINT "leads_clientId_fkey" FOREIGN KEY ("client_id") REFERENCES "vympa_private"."clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "financial_transactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "vympa_private"."clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "financial_transactions_contractId_clientId_fkey" FOREIGN KEY ("contractId","clientId") REFERENCES "vympa_private"."contracts" ("id","clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "client_contacts_one_primary" ON "vympa_private"."client_contacts" ("clientId") WHERE "primary";
CREATE INDEX "leads_client_id_idx" ON "vympa_private"."leads" ("client_id");
CREATE INDEX "financial_transactions_clientId_contractId_idx" ON "vympa_private"."financial_transactions" ("clientId","contractId");
ALTER TABLE "vympa_private"."financial_transactions" ADD CONSTRAINT "contract_billing_link" CHECK ("contractId" IS NULL OR ("clientId" IS NOT NULL AND "billingReference" IS NOT NULL));
ALTER TABLE "vympa_private"."contracts" ADD CONSTRAINT "contract_values_valid" CHECK (COALESCE("setupCents",0) BETWEEN 0 AND 1000000000 AND COALESCE("monthlyCents",0) BETWEEN 0 AND 1000000000), ADD CONSTRAINT "contract_dates_valid" CHECK ("endsOn" IS NULL OR "startsOn" IS NULL OR "endsOn">="startsOn"), ADD CONSTRAINT "contract_billing_period" CHECK ("billingPeriod" IN ('MONTHLY','QUARTERLY','YEARLY','ONCE'));
ALTER TABLE "vympa_private"."contract_amendments" ADD CONSTRAINT "amendment_values_valid" CHECK ("monthlyCents" BETWEEN 0 AND 1000000000 AND "previousMonthlyCents" BETWEEN 0 AND 1000000000);
ALTER TABLE "vympa_private"."clients" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."clients" FROM PUBLIC;
ALTER TABLE "vympa_private"."client_contacts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."client_contacts" FROM PUBLIC;
ALTER TABLE "vympa_private"."client_services" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."client_services" FROM PUBLIC;
ALTER TABLE "vympa_private"."client_activities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."client_activities" FROM PUBLIC;
ALTER TABLE "vympa_private"."contracts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."contracts" FROM PUBLIC;
ALTER TABLE "vympa_private"."contract_services" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."contract_services" FROM PUBLIC;
ALTER TABLE "vympa_private"."contract_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."contract_documents" FROM PUBLIC;
ALTER TABLE "vympa_private"."contract_amendments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."contract_amendments" FROM PUBLIC;
ALTER TABLE "vympa_private"."contract_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."contract_history" FROM PUBLIC;
DO $permissions$ BEGIN
IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM anon; END IF;
IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM authenticated; END IF;
END $permissions$;
COMMIT;
