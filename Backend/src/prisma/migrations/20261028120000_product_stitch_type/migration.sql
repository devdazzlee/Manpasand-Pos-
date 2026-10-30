-- Stitched / Unstitched lives on the product (separate from category) so
-- every report can filter on it alongside category, subcategory and vendor.
CREATE TYPE "StitchType" AS ENUM ('STITCHED', 'UNSTITCHED');

ALTER TABLE "Product" ADD COLUMN "stitch_type" "StitchType";

CREATE INDEX "Product_stitch_type_idx" ON "Product"("stitch_type");

-- Backfill from existing catalog names: a subcategory (or category) already
-- called "Unstitched" / "Stitched" decides the type. Unmatched rows stay NULL.
UPDATE "Product" p
SET "stitch_type" = x.t
FROM (
  SELECT p2."id",
    CASE
      WHEN COALESCE(s."name", '') ~* 'un[\s_-]*stitch' THEN 'UNSTITCHED'::"StitchType"
      WHEN COALESCE(s."name", '') ~* 'stitch' THEN 'STITCHED'::"StitchType"
      WHEN COALESCE(c."name", '') ~* 'un[\s_-]*stitch' THEN 'UNSTITCHED'::"StitchType"
      WHEN COALESCE(c."name", '') ~* 'stitch' THEN 'STITCHED'::"StitchType"
    END AS t
  FROM "Product" p2
  LEFT JOIN "Subcategory" s ON s."id" = p2."subcategory_id"
  LEFT JOIN "Category" c ON c."id" = p2."category_id"
) x
WHERE x."id" = p."id"
  AND x.t IS NOT NULL
  AND p."stitch_type" IS NULL;
