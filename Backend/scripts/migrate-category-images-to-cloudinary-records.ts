/**
 * One-time migration: copy legacy Category.image Cloudinary URLs into CategoryImages.
 * Run after deploying the CategoryImages-only image flow.
 *
 *   npx ts-node scripts/migrate-category-images-to-cloudinary-records.ts
 */
import { prisma } from '../src/prisma/client';

async function main() {
  const categories = await prisma.category.findMany({
    where: {
      image: { not: null },
    },
    include: {
      CategoryImages: {
        where: { status: 'COMPLETE' },
        take: 1,
      },
    },
  });

  let migrated = 0;
  let skipped = 0;

  for (const category of categories) {
    const url = category.image?.trim();
    if (!url || !url.startsWith('http')) {
      skipped++;
      continue;
    }

    if (category.CategoryImages.length > 0) {
      skipped++;
      continue;
    }

    await prisma.categoryImages.create({
      data: {
        category_id: category.id,
        image: url,
        status: 'COMPLETE',
      },
    });
    migrated++;
    console.log(`Migrated: ${category.name}`);
  }

  console.log(`Done. Migrated ${migrated}, skipped ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
