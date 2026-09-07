-- Add per-customer default discount used by the POS to auto-apply a discount
-- when the customer is selected on the New Sale screen.
ALTER TABLE "Customer" ADD COLUMN "default_discount_percent" DECIMAL(65,30) DEFAULT 0;
