-- CreateTable
CREATE TABLE "HoldPurchase" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "created_by" TEXT,
    "label" TEXT,
    "payload" JSONB NOT NULL,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoldPurchase_branch_id_idx" ON "HoldPurchase"("branch_id");

-- CreateIndex
CREATE INDEX "HoldPurchase_supplier_id_idx" ON "HoldPurchase"("supplier_id");

-- CreateIndex
CREATE INDEX "HoldPurchase_created_by_idx" ON "HoldPurchase"("created_by");

-- CreateIndex
CREATE INDEX "HoldPurchase_created_at_idx" ON "HoldPurchase"("created_at");

-- AddForeignKey
ALTER TABLE "HoldPurchase" ADD CONSTRAINT "HoldPurchase_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPurchase" ADD CONSTRAINT "HoldPurchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPurchase" ADD CONSTRAINT "HoldPurchase_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
