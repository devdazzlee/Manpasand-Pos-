-- Hide POS-only categories from the public website / customer app
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "display_on_website" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Category_display_on_website_idx" ON "Category"("display_on_website");
