-- Opening-stock imports (migration from a previous POS): one batch per file, undoable.
-- CreateEnum
CREATE TYPE "StockImportMode" AS ENUM ('ADD', 'SET');

-- CreateEnum
CREATE TYPE "StockImportStatus" AS ENUM ('PROCESSING', 'COMMITTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockImportLineStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED', 'ERROR', 'REVERSED');

-- CreateTable
CREATE TABLE "StockImportBatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "file_name" TEXT,
    "file_checksum" TEXT,
    "source_reference" TEXT,
    "notes" TEXT,
    "mode" "StockImportMode" NOT NULL DEFAULT 'SET',
    "status" "StockImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "update_cost" BOOLEAN NOT NULL DEFAULT false,
    "create_missing" BOOLEAN NOT NULL DEFAULT true,
    "stock_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_lines" INTEGER NOT NULL DEFAULT 0,
    "applied_lines" INTEGER NOT NULL DEFAULT 0,
    "error_lines" INTEGER NOT NULL DEFAULT 0,
    "created_products" INTEGER NOT NULL DEFAULT 0,
    "total_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "journal_voucher_id" TEXT,
    "reversal_voucher_id" TEXT,
    "created_by" TEXT,
    "reversed_by" TEXT,
    "reversed_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportLine" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_no" INTEGER NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT,
    "sku" TEXT,
    "name" TEXT,
    "category_name" TEXT,
    "brand_name" TEXT,
    "size_name" TEXT,
    "color_name" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30),
    "sale_price" DECIMAL(65,30),
    "previous_cost" DECIMAL(65,30),
    "create_product" BOOLEAN NOT NULL DEFAULT false,
    "created_product" BOOLEAN NOT NULL DEFAULT false,
    "status" "StockImportLineStatus" NOT NULL DEFAULT 'PENDING',
    "previous_qty" DECIMAL(65,30),
    "new_qty" DECIMAL(65,30),
    "applied_change" DECIMAL(65,30),
    "applied_value" DECIMAL(65,30),
    "error" TEXT,

    CONSTRAINT "StockImportLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockImportBatch_reference_key" ON "StockImportBatch"("reference");

-- CreateIndex
CREATE INDEX "StockImportBatch_file_checksum_idx" ON "StockImportBatch"("file_checksum");

-- CreateIndex
CREATE INDEX "StockImportBatch_source_reference_idx" ON "StockImportBatch"("source_reference");

-- CreateIndex
CREATE INDEX "StockImportBatch_status_idx" ON "StockImportBatch"("status");

-- CreateIndex
CREATE INDEX "StockImportBatch_created_at_idx" ON "StockImportBatch"("created_at");

-- CreateIndex
CREATE INDEX "StockImportLine_batch_id_status_idx" ON "StockImportLine"("batch_id", "status");

-- CreateIndex
CREATE INDEX "StockImportLine_product_id_idx" ON "StockImportLine"("product_id");

-- AddForeignKey
ALTER TABLE "StockImportBatch" ADD CONSTRAINT "StockImportBatch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportBatch" ADD CONSTRAINT "StockImportBatch_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "StockImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

