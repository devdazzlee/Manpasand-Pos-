-- Purchase invoices: the tracked supplier-payable document. Additive.

DO $$ BEGIN
  CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('UNPAID','PARTIALLY_PAID','PAID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseInvoice" (
  "id" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "purchase_order_id" TEXT,
  "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_date" TIMESTAMP(3),
  "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount_paid" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
  "notes" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseInvoice_supplier_id_invoice_number_key" ON "PurchaseInvoice"("supplier_id","invoice_number");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_supplier_id_idx" ON "PurchaseInvoice"("supplier_id");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_branch_id_idx" ON "PurchaseInvoice"("branch_id");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_status_idx" ON "PurchaseInvoice"("status");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_due_date_idx" ON "PurchaseInvoice"("due_date");

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "purchase_invoice_id" TEXT;
CREATE INDEX IF NOT EXISTS "Purchase_purchase_invoice_id_idx" ON "Purchase"("purchase_invoice_id");

ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "purchase_invoice_id" TEXT;
CREATE INDEX IF NOT EXISTS "SupplierPayment_purchase_invoice_id_idx" ON "SupplierPayment"("purchase_invoice_id");

DO $$ BEGIN
  ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
