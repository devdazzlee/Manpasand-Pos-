-- Bank Alfalah APG: track website order payment status and gateway transaction id.
DO $$ BEGIN
  ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "apg_transaction_id" TEXT;
CREATE INDEX IF NOT EXISTS "Order_payment_status_idx" ON "Order"("payment_status");
