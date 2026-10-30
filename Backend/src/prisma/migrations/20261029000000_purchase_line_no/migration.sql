-- Preserve entry order within a single bulk Stock In submission. Every line
-- in one submission shares the same purchase_date, so sorting by that alone
-- ties across the whole batch; line_no breaks the tie deterministically.
ALTER TABLE "Purchase" ADD COLUMN "line_no" INTEGER NOT NULL DEFAULT 0;
