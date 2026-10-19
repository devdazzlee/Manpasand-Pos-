-- Lifetime loyalty/giveaway winner discount: a fixed-percent discount capped
-- per transaction, limited to N uses/month, valid only at one branch.
ALTER TABLE "Customer" ADD COLUMN "is_loyalty_winner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "loyalty_cnic" TEXT;
ALTER TABLE "Customer" ADD COLUMN "loyalty_branch_id" TEXT;
ALTER TABLE "Customer" ADD COLUMN "loyalty_discount_percent" DECIMAL(65,30) DEFAULT 25;
ALTER TABLE "Customer" ADD COLUMN "loyalty_discount_cap" DECIMAL(65,30) DEFAULT 3000;
ALTER TABLE "Customer" ADD COLUMN "loyalty_monthly_limit" INTEGER DEFAULT 4;
ALTER TABLE "Customer" ADD COLUMN "loyalty_registered_at" TIMESTAMP(3);

CREATE INDEX "Customer_loyalty_branch_id_idx" ON "Customer"("loyalty_branch_id");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_loyalty_branch_id_fkey"
  FOREIGN KEY ("loyalty_branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tracks whether a given sale used a customer's loyalty-winner discount, so
-- the monthly usage limit can be counted directly from Sale rows.
ALTER TABLE "Sale" ADD COLUMN "loyalty_discount_applied" BOOLEAN NOT NULL DEFAULT false;
