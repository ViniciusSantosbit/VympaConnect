BEGIN;
CREATE TYPE "vympa_private"."LeadStatus" AS ENUM ('NOT_CONTACTED','CONTACTED','NEGOTIATING','WON','LOST');
CREATE TYPE "vympa_private"."LeadSegment" AS ENUM ('ADVOCACIA','CONTABILIDADE','IMOBILIARIO');
CREATE TABLE "vympa_private"."leads" (
 "id" UUID PRIMARY KEY, "company_name" VARCHAR(180), "segment" "vympa_private"."LeadSegment" NOT NULL,
 "region" VARCHAR(20), "state" VARCHAR(2), "city" VARCHAR(100), "email" VARCHAR(254),
 "contact_name" VARCHAR(150), "contact_channel" VARCHAR(180), "status" "vympa_private"."LeadStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
 "loss_reason" VARCHAR(1000), "last_contact_at" TIMESTAMPTZ(3), "next_action" VARCHAR(500), "assignee_id" UUID, "created_by_id" UUID NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "leads_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "leads_loss_reason_check" CHECK (status <> 'LOST' OR length(trim(loss_reason)) > 0)
);
CREATE INDEX "leads_status_updated_at_idx" ON "vympa_private"."leads"("status","updated_at");
CREATE INDEX "leads_assignee_id_status_idx" ON "vympa_private"."leads"("assignee_id","status");
CREATE INDEX "leads_segment_state_city_idx" ON "vympa_private"."leads"("segment","state","city");
CREATE TABLE "vympa_private"."place_references" (
 "place_id" VARCHAR(255) PRIMARY KEY, "lead_id" UUID NOT NULL UNIQUE, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "place_references_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "vympa_private"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "vympa_private"."lead_events" (
 "id" UUID PRIMARY KEY, "lead_id" UUID NOT NULL, "actor_id" UUID NOT NULL, "kind" VARCHAR(30) NOT NULL,
 "body" VARCHAR(4000), "channel" VARCHAR(40), "previous_status" "vympa_private"."LeadStatus", "new_status" "vympa_private"."LeadStatus",
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "vympa_private"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "lead_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "lead_events_lead_id_created_at_idx" ON "vympa_private"."lead_events"("lead_id","created_at");
CREATE INDEX "lead_events_created_at_idx" ON "vympa_private"."lead_events"("created_at");
CREATE TABLE "vympa_private"."lead_follow_ups" (
 "id" UUID PRIMARY KEY, "lead_id" UUID NOT NULL, "action" VARCHAR(500) NOT NULL, "due_at" TIMESTAMPTZ(3) NOT NULL,
 "completed_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "lead_follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "vympa_private"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "lead_follow_ups_lead_id_due_at_idx" ON "vympa_private"."lead_follow_ups"("lead_id","due_at");
CREATE INDEX "lead_follow_ups_completed_at_due_at_idx" ON "vympa_private"."lead_follow_ups"("completed_at","due_at");
CREATE TABLE "vympa_private"."places_usage" (
 "profile_id" UUID NOT NULL, "hour" TIMESTAMPTZ(3) NOT NULL, "calls" INTEGER NOT NULL DEFAULT 0, "details" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "places_usage_pkey" PRIMARY KEY ("profile_id","hour"),
 CONSTRAINT "places_usage_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "places_usage_counts_check" CHECK (calls >= 0 AND details >= 0 AND details <= calls)
);
CREATE INDEX "places_usage_hour_idx" ON "vympa_private"."places_usage"("hour");
ALTER TABLE "vympa_private"."leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."place_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."lead_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."lead_follow_ups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."places_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."leads", "vympa_private"."place_references", "vympa_private"."lead_events", "vympa_private"."lead_follow_ups", "vympa_private"."places_usage" FROM PUBLIC;
COMMIT;
