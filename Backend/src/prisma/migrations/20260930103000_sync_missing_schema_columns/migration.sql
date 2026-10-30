-- Brings older databases up to the schema. Every step is guarded so it is a
-- no-op where the type / column / index / constraint already exists (the
-- Manpasand database already had most of these).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StockAdjustmentType" AS ENUM ('ADDITION', 'SUBTRACTION', 'RECONCILIATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StockAdjustmentCategory" AS ENUM ('CORRECTION', 'DAMAGE', 'EXPIRED', 'THEFT', 'RETURN_TO_SUPPLIER', 'ADMINISTRATIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "code" SET DEFAULT 'CAT-' || gen_random_uuid();

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "credit_limit" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "previous_credit_balance" DECIMAL(65,30) DEFAULT 0,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_email" TEXT,
ADD COLUMN IF NOT EXISTS "customer_name" TEXT,
ADD COLUMN IF NOT EXISTS "customer_phone" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_address" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_city" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_postal_code" TEXT,
ADD COLUMN IF NOT EXISTS "order_notes" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "grams_per_unit" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "is_finished_good" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "is_loose_item" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN IF NOT EXISTS "break_time" TEXT DEFAULT '1 hour',
ADD COLUMN IF NOT EXISTS "sales" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN IF NOT EXISTS "adjustment_category" "StockAdjustmentCategory" NOT NULL DEFAULT 'CORRECTION',
ADD COLUMN IF NOT EXISTS "adjustment_type" "StockAdjustmentType" NOT NULL DEFAULT 'RECONCILIATION',
ADD COLUMN IF NOT EXISTS "change_quantity" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "reference_no" TEXT,
ALTER COLUMN "physical_count" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "carrier_name" TEXT,
ADD COLUMN IF NOT EXISTS "estimated_arrival" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reason" TEXT DEFAULT 'Stock Replenishment',
ADD COLUMN IF NOT EXISTS "receiver_name" TEXT,
ADD COLUMN IF NOT EXISTS "vehicle_no" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockAdjustment_adjustment_type_idx" ON "StockAdjustment"("adjustment_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockAdjustment_adjustment_category_idx" ON "StockAdjustment"("adjustment_category");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "Sale_original_sale_id_fkey" FOREIGN KEY ("original_sale_id") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
