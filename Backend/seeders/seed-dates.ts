import { ProductService } from '../src/services/product.service';
import { prisma } from '../src/prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

interface ProductInput {
  name: string;
  unit: string;
  category: string;
  purchase_rate?: number | string;
  selling_price: number | string;
}

const products: ProductInput[] = [
  { name: "Ajwa Dates Small", unit: "Kgs", category: "Dates", purchase_rate: 2600, selling_price: 4800 },
  { name: "Irani Dates (Box)", unit: "Pcs", category: "Dates", purchase_rate: 324.58, selling_price: 550 },
  { name: "Kalmi Dates", unit: "Kgs", category: "Dates", purchase_rate: 2300, selling_price: 3600 },
  { name: "Mabroom Dates", unit: "Kgs", category: "Dates", purchase_rate: 2100, selling_price: 4800 },
  { name: "Punjgor Dates", unit: "Kgs", category: "Dates", purchase_rate: 412.5, selling_price: 1200 },
  { name: "Sugai Dates", unit: "Kgs", category: "Dates", purchase_rate: 550, selling_price: 3200 },
  { name: "Ajwa Powder", unit: "Pcs", category: "Dates", purchase_rate: 600, selling_price: 1200 },
  { name: "Ajwa Paste", unit: "Pcs", category: "Dates", purchase_rate: 900, selling_price: 1500 },
  { name: "Amber Dates", unit: "Kgs", category: "Dates", purchase_rate: 2750, selling_price: 4800 },
  { name: "Zahidi Dates", unit: "Kgs", category: "Dates", purchase_rate: 430, selling_price: 1200 },
  { name: "Rabbai Dates", unit: "Kgs", category: "Dates", purchase_rate: 680, selling_price: 1400 },
  { name: "Sukhri Dates", unit: "Kgs", category: "Dates", purchase_rate: 2040, selling_price: 4800 },
  { name: "Medjool Dates", unit: "Kgs", category: "Dates", purchase_rate: 0, selling_price: 6000 },
];

async function seedDates() {
  console.log('🌱 Starting Dates seeder...\n');

  const productService = new ProductService();
  const results = {
    success: [] as string[],
    failed: [] as { name: string; error: string }[],
  };

  console.log(`📦 Processing ${products.length} products...\n`);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    try {
      // Handle purchase rate - use 0 if missing, don't calculate
      let purchaseRate: number = 0;
      const purchaseRateValue = product.purchase_rate;

      if (purchaseRateValue && purchaseRateValue !== '' && purchaseRateValue !== 'Default') {
        if (typeof purchaseRateValue === 'number') {
          purchaseRate = purchaseRateValue;
        } else if (typeof purchaseRateValue === 'string') {
          purchaseRate = parseFloat(purchaseRateValue) || 0;
        }
      }

      // Handle selling price - use 0 if missing, don't calculate
      let sellingPrice: number = 0;
      const sellingPriceValue = product.selling_price;

      if (sellingPriceValue && sellingPriceValue !== '' && sellingPriceValue !== 0) {
        if (typeof sellingPriceValue === 'number') {
          sellingPrice = sellingPriceValue;
        } else if (typeof sellingPriceValue === 'string') {
          sellingPrice = parseFloat(sellingPriceValue) || 0;
        }
      }

      // Create or update product using ProductService (it handles upserts)
      const created = await productService.createProductFromBulkUpload({
        name: product.name,
        category_name: product.category,
        unit_name: product.unit,
        purchase_rate: purchaseRate,
        sales_rate_exc_dis_and_tax: sellingPrice,
        sales_rate_inc_dis_and_tax: sellingPrice,
        min_qty: 10,
        max_qty: 10,
      });

      results.success.push(product.name);
      console.log(
        `✅ [${i + 1}/${products.length}] ${product.name} - Created/Updated (ID: ${created.id})`
      );
    } catch (error) {
      const errorMessage = (error as Error).message;
      results.failed.push({ name: product.name, error: errorMessage });
      console.error(
        `❌ [${i + 1}/${products.length}] ${product.name} - Failed: ${errorMessage}`
      );
    }
  }

  console.log('\n📊 Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   ✅ Successfully created/updated: ${results.success.length} products`);
  console.log(`   ❌ Failed: ${results.failed.length} products`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed products:');
    results.failed.forEach(({ name, error }) => {
      console.log(`   - ${name}: ${error}`);
    });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ Dates seeder completed!');
}

// Run seeder
seedDates()
  .then(() => {
    return prisma.$disconnect();
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    return prisma.$disconnect().then(() => process.exit(1));
  });


