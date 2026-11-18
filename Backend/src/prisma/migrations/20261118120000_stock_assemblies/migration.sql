-- Product assembly / conversion: combine components into a finished SKU.
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'ASSEMBLY_IN';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'ASSEMBLY_OUT';

CREATE TABLE IF NOT EXISTS "StockAssembly" (
    "id" TEXT NOT NULL,
    "reference_no" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "finished_product_id" TEXT NOT NULL,
    "finished_quantity" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30),
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAssembly_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockAssemblyLine" (
    "id" TEXT NOT NULL,
    "assembly_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAssemblyLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockAssembly_reference_no_key" ON "StockAssembly"("reference_no");
CREATE INDEX IF NOT EXISTS "StockAssembly_branch_id_idx" ON "StockAssembly"("branch_id");
CREATE INDEX IF NOT EXISTS "StockAssembly_finished_product_id_idx" ON "StockAssembly"("finished_product_id");
CREATE INDEX IF NOT EXISTS "StockAssembly_created_at_idx" ON "StockAssembly"("created_at");
CREATE INDEX IF NOT EXISTS "StockAssembly_reference_no_idx" ON "StockAssembly"("reference_no");
CREATE INDEX IF NOT EXISTS "StockAssemblyLine_assembly_id_idx" ON "StockAssemblyLine"("assembly_id");
CREATE INDEX IF NOT EXISTS "StockAssemblyLine_product_id_idx" ON "StockAssemblyLine"("product_id");

DO $$ BEGIN
  ALTER TABLE "StockAssembly" ADD CONSTRAINT "StockAssembly_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAssembly" ADD CONSTRAINT "StockAssembly_finished_product_id_fkey"
    FOREIGN KEY ("finished_product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAssembly" ADD CONSTRAINT "StockAssembly_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAssemblyLine" ADD CONSTRAINT "StockAssemblyLine_assembly_id_fkey"
    FOREIGN KEY ("assembly_id") REFERENCES "StockAssembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAssemblyLine" ADD CONSTRAINT "StockAssemblyLine_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
