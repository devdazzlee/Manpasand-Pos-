-- Expense module: categories, approval workflow, payment method (cash/bank),
-- recurring templates. Additive — existing cash-register expenses keep working.

-- Enums
DO $$ BEGIN
  CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH','BANK','CARD','MOBILE_MONEY','CHEQUE','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ExpenseCategory
CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- RecurringExpense
CREATE TABLE IF NOT EXISTS "RecurringExpense" (
  "id" TEXT NOT NULL,
  "particular" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "payment_method" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
  "bank_account" TEXT,
  "vendor" TEXT,
  "notes" TEXT,
  "category_id" TEXT,
  "branch_id" TEXT,
  "frequency" "RecurringFrequency" NOT NULL DEFAULT 'MONTHLY',
  "interval" INTEGER NOT NULL DEFAULT 1,
  "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "end_date" TIMESTAMP(3),
  "next_run_date" TIMESTAMP(3) NOT NULL,
  "last_run_date" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "auto_approve" BOOLEAN NOT NULL DEFAULT false,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringExpense_is_active_idx" ON "RecurringExpense"("is_active");
CREATE INDEX IF NOT EXISTS "RecurringExpense_next_run_date_idx" ON "RecurringExpense"("next_run_date");

-- Expense: new columns
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "category_id" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "payment_method" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "bank_account" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "vendor" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "approved_by" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "created_by" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "recurring_id" TEXT;

CREATE INDEX IF NOT EXISTS "Expense_status_idx" ON "Expense"("status");
CREATE INDEX IF NOT EXISTS "Expense_expense_date_idx" ON "Expense"("expense_date");
CREATE INDEX IF NOT EXISTS "Expense_category_id_idx" ON "Expense"("category_id");
CREATE INDEX IF NOT EXISTS "Expense_branch_id_idx" ON "Expense"("branch_id");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Existing cash-drawer expenses were already spent — treat them as approved.
UPDATE "Expense" SET "status" = 'APPROVED', "approved_at" = "created_at"
  WHERE "cashflow_id" IS NOT NULL AND "status" = 'PENDING';
