BEGIN;
CREATE TABLE "vympa_private"."ai_conversations" (
 "id" UUID NOT NULL PRIMARY KEY,
 "profileId" UUID NOT NULL,
 "role" "vympa_private"."AdminRole" NOT NULL,
 "title" VARCHAR(120) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "ai_conversations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ai_conversations_profileId_role_updatedAt_idx" ON "vympa_private"."ai_conversations"("profileId","role","updatedAt");
CREATE TABLE "vympa_private"."ai_messages" (
 "id" UUID NOT NULL PRIMARY KEY,
 "conversationId" UUID NOT NULL,
 "requestKey" UUID NOT NULL,
 "question" VARCHAR(2000) NOT NULL,
 "answer" VARCHAR(12000),
 "status" VARCHAR(15) NOT NULL DEFAULT 'PENDING',
 "sources" JSONB,
 "errorCode" VARCHAR(30),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMPTZ(3),
 CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "vympa_private"."ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ai_message_status_valid" CHECK ("status" IN ('PENDING','COMPLETED','FAILED'))
);
CREATE UNIQUE INDEX "ai_messages_requestKey_key" ON "vympa_private"."ai_messages"("requestKey");
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "vympa_private"."ai_messages"("conversationId","createdAt");
ALTER TABLE "vympa_private"."ai_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."ai_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."ai_conversations","vympa_private"."ai_messages" FROM PUBLIC;
DO $permissions$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "vympa_private"."ai_conversations","vympa_private"."ai_messages" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "vympa_private"."ai_conversations","vympa_private"."ai_messages" FROM authenticated; END IF;
END $permissions$;
COMMIT;
