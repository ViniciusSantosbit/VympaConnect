BEGIN;
CREATE TABLE "vympa_private"."goals" (
 "id" UUID NOT NULL PRIMARY KEY,
 "requestKey" UUID NOT NULL,
 "title" VARCHAR(180) NOT NULL,
 "description" VARCHAR(3000),
 "category" VARCHAR(20) NOT NULL,
 "metric" VARCHAR(40) NOT NULL,
 "mode" VARCHAR(10) NOT NULL,
 "direction" VARCHAR(15) NOT NULL,
 "unit" VARCHAR(15) NOT NULL,
 "target" DECIMAL(24,4) NOT NULL,
 "baseline" DECIMAL(24,4),
 "startsOn" DATE NOT NULL,
 "endsOn" DATE NOT NULL,
 "priority" VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
 "periodicity" VARCHAR(15) NOT NULL DEFAULT 'CUSTOM',
 "segment" "vympa_private"."LeadSegment",
 "scope" VARCHAR(15) NOT NULL,
 "adminVisible" BOOLEAN NOT NULL DEFAULT false,
 "allowManualUpdates" BOOLEAN NOT NULL DEFAULT false,
 "alertDays" INTEGER NOT NULL DEFAULT 7,
 "notes" VARCHAR(3000),
 "blocked" BOOLEAN NOT NULL DEFAULT false,
 "cancelledAt" TIMESTAMPTZ(3),
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdById" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "goals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "goal_period_valid" CHECK ("endsOn">="startsOn"),
 CONSTRAINT "goal_values_valid" CHECK ("target" BETWEEN 0 AND 1000000000000 AND ("baseline" IS NULL OR "baseline" BETWEEN 0 AND 1000000000000)),
 CONSTRAINT "goal_mode_valid" CHECK ("mode" IN ('AUTO','MANUAL')),
 CONSTRAINT "goal_category_valid" CHECK ("category" IN ('COMMERCIAL','FINANCIAL','TEAM')),
 CONSTRAINT "goal_direction_valid" CHECK ("direction" IN ('GROWTH','LIMIT','REDUCTION')),
 CONSTRAINT "goal_scope_valid" CHECK ("scope" IN ('COMPANY','ASSIGNED')),
 CONSTRAINT "goal_reduction_valid" CHECK ("direction"<>'REDUCTION' OR "baseline">"target"),
 CONSTRAINT "goal_alert_valid" CHECK ("alertDays" BETWEEN 0 AND 90),
 CONSTRAINT "goal_auto_immutable" CHECK ("mode"<>'AUTO' OR NOT "allowManualUpdates")
);
CREATE UNIQUE INDEX "goals_requestKey_key" ON "vympa_private"."goals"("requestKey");
CREATE INDEX "goals_category_cancelledAt_endsOn_idx" ON "vympa_private"."goals"("category","cancelledAt","endsOn");
CREATE INDEX "goals_metric_startsOn_endsOn_idx" ON "vympa_private"."goals"("metric","startsOn","endsOn");
CREATE TABLE "vympa_private"."goal_assignments" (
 "goalId" UUID NOT NULL,
 "profileId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "goal_assignments_pkey" PRIMARY KEY ("goalId","profileId"),
 CONSTRAINT "goal_assignments_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "vympa_private"."goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "goal_assignments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "goal_assignments_profileId_idx" ON "vympa_private"."goal_assignments"("profileId");
CREATE TABLE "vympa_private"."goal_manual_updates" (
 "id" UUID NOT NULL PRIMARY KEY,
 "requestKey" UUID NOT NULL,
 "goalId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "value" DECIMAL(24,4) NOT NULL,
 "observedOn" DATE NOT NULL,
 "reason" VARCHAR(3000) NOT NULL,
 "goalVersion" INTEGER NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "goal_manual_updates_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "vympa_private"."goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "goal_manual_updates_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "goal_manual_value_valid" CHECK ("value" BETWEEN 0 AND 1000000000000)
);
CREATE UNIQUE INDEX "goal_manual_updates_requestKey_key" ON "vympa_private"."goal_manual_updates"("requestKey");
CREATE INDEX "goal_manual_updates_goalId_observedOn_createdAt_idx" ON "vympa_private"."goal_manual_updates"("goalId","observedOn","createdAt");
CREATE TABLE "vympa_private"."goal_activities" (
 "id" UUID NOT NULL PRIMARY KEY,
 "goalId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "kind" VARCHAR(40) NOT NULL,
 "body" VARCHAR(3000) NOT NULL,
 "before" JSONB,
 "after" JSONB,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "goal_activities_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "vympa_private"."goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "goal_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "goal_activities_goalId_createdAt_idx" ON "vympa_private"."goal_activities"("goalId","createdAt");
CREATE TABLE "vympa_private"."goal_progress_snapshots" (
 "id" UUID NOT NULL PRIMARY KEY,
 "goalId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "goalVersion" INTEGER NOT NULL,
 "data" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "goal_progress_snapshots_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "vympa_private"."goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "goal_progress_snapshots_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vympa_private"."admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "goal_progress_snapshots_goalId_createdAt_idx" ON "vympa_private"."goal_progress_snapshots"("goalId","createdAt");
ALTER TABLE "vympa_private"."goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."goal_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."goal_manual_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."goal_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vympa_private"."goal_progress_snapshots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vympa_private"."goals","vympa_private"."goal_assignments","vympa_private"."goal_manual_updates","vympa_private"."goal_activities","vympa_private"."goal_progress_snapshots" FROM PUBLIC;
DO $permissions$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON ALL TABLES IN SCHEMA "vympa_private" FROM authenticated; END IF;
END $permissions$;
COMMIT;
