-- Purchase returns + link received Purchases to their PurchaseOrder.
-- Additive; PurchaseOrder / PurchaseOrderItem tables already exist.

DO $$ BEGIN
  CREATE TYPE "PurchaseReturnStatus" AS ENUM ('PENDING','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PURCHASE_RETURN';
EXCEPTION WHEN others THEN null; END $$;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "purchase_order_id" TEXT;
CREATE INDEX IF NOT EXISTS "Purchase_purchase_order_id_idx" ON "Purchase"("purchase_order_id");
DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_purchase_order_id_fkey"
    FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseReturn" (
  "id" TEXT NOT NULL,
  "return_number" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "purchase_order_id" TEXT,
  "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'COMPLETED',
  "reason" TEXT,
  "notes" TEXT,
  "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReturn_return_number_key" ON "PurchaseReturn"("return_number");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_supplier_id_idx" ON "PurchaseReturn"("supplier_id");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_branch_id_idx" ON "PurchaseReturn"("branch_id");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_return_date_idx" ON "PurchaseReturn"("return_date");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_status_idx" ON "PurchaseReturn"("status");

CREATE TABLE IF NOT EXISTS "PurchaseReturnItem" (
  "id" TEXT NOT NULL,
  "purchase_return_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL,
  "unit_cost" DECIMAL(65,30) NOT NULL,
  "total_cost" DECIMAL(65,30) NOT NULL,
  "purchase_id" TEXT,
  CONSTRAINT "PurchaseReturnItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PurchaseReturnItem_purchase_return_id_idx" ON "PurchaseReturnItem"("purchase_return_id");
CREATE INDEX IF NOT EXISTS "PurchaseReturnItem_product_id_idx" ON "PurchaseReturnItem"("product_id");

DO $$ BEGIN
  ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchase_order_id_fkey"
    FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchase_return_id_fkey"
    FOREIGN KEY ("purchase_return_id") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
