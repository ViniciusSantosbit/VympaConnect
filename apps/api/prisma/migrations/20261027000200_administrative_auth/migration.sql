BEGIN;
CREATE SCHEMA "vympa_private";
REVOKE ALL ON SCHEMA "vympa_private" FROM PUBLIC;
CREATE TYPE "vympa_private"."AdminRole" AS ENUM ('OWNER', 'ADMIN');
CREATE TABLE "vympa_private"."admin_profiles" (
 "id" UUID PRIMARY KEY, "identity_id" UUID NOT NULL UNIQUE, "email" VARCHAR(254) NOT NULL UNIQUE,
 "role" "vympa_private"."AdminRole" NOT NULL DEFAULT 'ADMIN', "active" BOOLEAN NOT NULL DEFAULT true,
 "recovery_required" BOOLEAN NOT NULL DEFAULT false,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "admin_profiles_email_normalized" CHECK (email = lower(email))
);
CREATE INDEX "admin_profiles_active_role_idx" ON "vympa_private"."admin_profiles"("active", "role");
CREATE TABLE "vympa_private"."admin_invitations" (
 "id" UUID PRIMARY KEY, "email" VARCHAR(254) NOT NULL, "identity_id" UUID,
 "role" "vympa_private"."AdminRole" NOT NULL DEFAULT 'ADMIN', "issued_by_id" UUID NOT NULL,
 "expires_at" TIMESTAMPTZ(3) NOT NULL, "accepted_at" TIMESTAMPTZ(3), "revoked_at" TIMESTAMPTZ(3),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "admin_invitations_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "admin_invitations_email_normalized" CHECK (email = lower(email)),
 CONSTRAINT "admin_invitations_role_admin" CHECK (role = 'ADMIN'),
 CONSTRAINT "admin_invitations_expiry" CHECK (expires_at > created_at)
);
CREATE INDEX "admin_invitations_identity_id_email_expires_at_idx" ON "vympa_private"."admin_invitations"("identity_id", "email", "expires_at");
CREATE INDEX "admin_invitations_issued_by_id_idx" ON "vympa_private"."admin_invitations"("issued_by_id");
CREATE TABLE "vympa_private"."auth_sessions" (
 "id" VARCHAR(64) PRIMARY KEY, "identity_id" UUID NOT NULL, "tokens_cipher" TEXT NOT NULL,
 "csrf_hash" VARCHAR(64) NOT NULL, "recovery" BOOLEAN NOT NULL DEFAULT false,
 "expires_at" TIMESTAMPTZ(3) NOT NULL, "revoked_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "auth_sessions_identity_id_revoked_at_idx" ON "vympa_private"."auth_sessions"("identity_id", "revoked_at");
CREATE INDEX "auth_sessions_expires_at_idx" ON "vympa_private"."auth_sessions"("expires_at");
CREATE TABLE "vympa_private"."admin_audit_events" (
 "id" UUID PRIMARY KEY, "actor_id" UUID, "action" VARCHAR(80) NOT NULL, "target_id" UUID,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "admin_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "admin_audit_events_actor_id_created_at_idx" ON "vympa_private"."admin_audit_events"("actor_id", "created_at");
CREATE INDEX "admin_audit_events_target_id_created_at_idx" ON "vympa_private"."admin_audit_events"("target_id", "created_at");
CREATE TABLE "vympa_private"."mfa_recovery_requests" (
 "id" UUID PRIMARY KEY, "identity_id" UUID NOT NULL, "approved_by_id" UUID,
 "approved_at" TIMESTAMPTZ(3), "executed_at" TIMESTAMPTZ(3), "case_reference" VARCHAR(64), "expires_at" TIMESTAMPTZ(3) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "mfa_recovery_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "mfa_recovery_requests_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "vympa_private"."admin_profiles"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "mfa_recovery_requests_identity_id_expires_at_idx" ON "vympa_private"."mfa_recovery_requests"("identity_id", "expires_at");
-- Sem políticas para clientes: somente a credencial PostgreSQL privada do backend acessa estas tabelas.
ALTER TABLE "vympa_private"."admin_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."admin_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."auth_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."admin_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."mfa_recovery_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM PUBLIC;
DO $permissions$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
   REVOKE ALL ON SCHEMA "vympa_private" FROM anon;
   REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
   REVOKE ALL ON SCHEMA "vympa_private" FROM authenticated;
   REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM authenticated;
 END IF;
END $permissions$;
COMMIT;
