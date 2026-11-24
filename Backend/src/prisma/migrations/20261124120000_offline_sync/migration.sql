-- Offline sync: till-owned sale ids + SyncMutation idempotency log
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "client_id" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "device_id" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "recorded_offline" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_client_id_key" ON "Sale"("client_id");

DO $$ BEGIN
  CREATE TYPE "SyncMutationStatus" AS ENUM ('APPLIED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "SyncMutation" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "status" "SyncMutationStatus" NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "client_time" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warning" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncMutation_device_id_idx" ON "SyncMutation"("device_id");
CREATE INDEX IF NOT EXISTS "SyncMutation_processed_at_idx" ON "SyncMutation"("processed_at");
CREATE INDEX IF NOT EXISTS "SyncMutation_reviewed_at_idx" ON "SyncMutation"("reviewed_at");
