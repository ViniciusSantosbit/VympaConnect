BEGIN;
-- Preserve existing Google references and allow namespaced Geoapify identifiers.
ALTER TABLE "vympa_private"."place_references" ALTER COLUMN "place_id" TYPE VARCHAR(2048);
COMMIT;
