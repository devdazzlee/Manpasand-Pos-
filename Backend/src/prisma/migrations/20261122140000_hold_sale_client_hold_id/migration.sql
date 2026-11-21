-- Idempotent offline / retry hold create: one server hold per till client id.
ALTER TABLE "HoldSale" ADD COLUMN IF NOT EXISTS "client_hold_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "HoldSale_client_hold_id_key" ON "HoldSale"("client_hold_id");
CREATE INDEX IF NOT EXISTS "HoldSale_client_hold_id_idx" ON "HoldSale"("client_hold_id");
