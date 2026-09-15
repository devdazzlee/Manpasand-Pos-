-- Hide a product from the website while keeping it sellable on POS.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "display_on_website" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "Product_display_on_website_idx" ON "Product"("display_on_website");
