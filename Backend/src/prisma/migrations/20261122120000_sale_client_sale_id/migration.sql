-- Idempotent offline / retry sale create: one server sale per till client id.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "client_sale_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_client_sale_id_key" ON "Sale"("client_sale_id");
CREATE INDEX IF NOT EXISTS "Sale_client_sale_id_idx" ON "Sale"("client_sale_id");
