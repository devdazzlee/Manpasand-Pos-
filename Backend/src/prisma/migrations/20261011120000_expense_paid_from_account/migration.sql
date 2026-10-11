-- Expenses record which cash / bank account the money left from, so Cash in Hand
-- and Bank in the Chart of Accounts go down when an expense is paid.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paid_from_account_id" TEXT;
ALTER TABLE "RecurringExpense" ADD COLUMN IF NOT EXISTS "paid_from_account_id" TEXT;

CREATE INDEX IF NOT EXISTS "Expense_paid_from_account_id_idx" ON "Expense"("paid_from_account_id");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
