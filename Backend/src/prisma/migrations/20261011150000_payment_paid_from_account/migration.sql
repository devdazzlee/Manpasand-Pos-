-- Salary, commission and supplier payments record which cash / bank account
-- the money came from, so Chart of Accounts posts to that exact account.
ALTER TABLE "Salary" ADD COLUMN IF NOT EXISTS "paid_from_account_id" TEXT;
ALTER TABLE "Commission" ADD COLUMN IF NOT EXISTS "paid_from_account_id" TEXT;
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "paid_from_account_id" TEXT;

CREATE INDEX IF NOT EXISTS "Salary_paid_from_account_id_idx" ON "Salary"("paid_from_account_id");
CREATE INDEX IF NOT EXISTS "Commission_paid_from_account_id_idx" ON "Commission"("paid_from_account_id");
CREATE INDEX IF NOT EXISTS "SupplierPayment_paid_from_account_id_idx" ON "SupplierPayment"("paid_from_account_id");

ALTER TABLE "Salary" ADD CONSTRAINT "Salary_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
