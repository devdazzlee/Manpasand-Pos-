-- Per-product quantity choices for the website (in the product's own unit).
-- Empty array = the website keeps its default choices for the unit.
ALTER TABLE "Product" ADD COLUMN "website_quantity_options" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[];
