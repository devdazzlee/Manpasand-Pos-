import { ProductService } from '../src/services/product.service';
import { prisma } from '../src/prisma/client';

interface ProductInput {
    name: string;
    unit: string;
    category: string;
    purchase_rate?: number;
    selling_price: number;
}

const products: ProductInput[] = [
    { name: "Anmol Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 0, selling_price: 0 },
    { name: "Barley (Jaww)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 200, selling_price: 320 },
    { name: "Black Chickpeas (Kaala Chana)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 280, selling_price: 500 },
    { name: "Daal Arhar", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 640, selling_price: 880 },
    { name: "Daal Haleem Mix", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 250, selling_price: 600 },
    { name: "Daal Maash", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 470, selling_price: 680 },
    { name: "Daal Maash Chilka", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 440, selling_price: 560 },
    { name: "Daal Maash Sabut", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 420, selling_price: 680 },
    { name: "Daal Mix", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 250, selling_price: 600 },
    { name: "Daal Moong", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 405, selling_price: 480 },
    { name: "Daal Moong Chilka", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 380, selling_price: 480 },
    { name: "Daal Moong Sabut", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 400, selling_price: 480 },
    { name: "Gandum Daliya Bareeq", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 180, selling_price: 320 },
    { name: "Gandum Daliya Mota", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 180, selling_price: 320 },
    { name: "Jasmine Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 0, selling_price: 0 },
    { name: "Jaww Ka Daliya", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 230, selling_price: 400 },
    { name: "Kaali Masoor", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 270, selling_price: 480 },
    { name: "Kangni", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 250, selling_price: 340 },
    { name: "Kidney Beans (Red)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 640, selling_price: 800 },
    { name: "Lal Masoor", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 295, selling_price: 480 },
    { name: "Millets (Bajra)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 125, selling_price: 160 },
    { name: "Mixed Dana", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 0, selling_price: 0 },
    { name: "Mughal Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 0, selling_price: 0 },
    { name: "Red Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 220, selling_price: 380 },
    { name: "Roasted Chickpeas", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 600, selling_price: 1000 },
    { name: "Roasted Chickpeas (W/o Skin)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 700, selling_price: 1100 },
    { name: "Sella Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 340, selling_price: 450 },
    { name: "Soya Bean", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 480, selling_price: 1000 },
    { name: "Split Chickpeas (Channay Ki Daal)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 290, selling_price: 540 },
    { name: "Star Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 220, selling_price: 350 },
    { name: "Super Kernel Basmati", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 355, selling_price: 450 },
    { name: "Taj Mehal rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 355, selling_price: 450 },
    { name: "Ujala Rice", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 0, selling_price: 0 },
    { name: "Wheat", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 150, selling_price: 240 },
    { name: "White Beans", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 400, selling_price: 700 },
    { name: "White Chickpeas (Large)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 480, selling_price: 680 },
    { name: "White Chickpeas (small)", unit: "Kgs", category: "Grains, Pulses & Rice", purchase_rate: 320, selling_price: 480 },
];

async function addAllProducts() {
    const productService = new ProductService();
    const results = {
        success: [] as string[],
        failed: [] as { name: string; error: string }[],
    };

    console.log(`🚀 Starting to add ${products.length} products...\n`);

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        try {
            // Handle products with 0 or missing prices
            let purchaseRate = product.purchase_rate && product.purchase_rate > 0 
                ? product.purchase_rate 
                : (product.selling_price > 0 ? Math.round(product.selling_price * 0.7) : 100);
            
            let sellingPrice = product.selling_price > 0 
                ? product.selling_price 
                : (purchaseRate > 0 ? Math.round(purchaseRate * 1.5) : 100);

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
            console.log(`✅ [${i + 1}/${products.length}] ${product.name} - Created (ID: ${created.id})`);
        } catch (error) {
            const errorMessage = (error as Error).message;
            results.failed.push({ name: product.name, error: errorMessage });
            console.error(`❌ [${i + 1}/${products.length}] ${product.name} - Failed: ${errorMessage}`);
        }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Successfully created: ${results.success.length} products`);
    console.log(`   ❌ Failed: ${results.failed.length} products`);
    
    if (results.failed.length > 0) {
        console.log('\n❌ Failed products:');
        results.failed.forEach(({ name, error }) => {
            console.log(`   - ${name}: ${error}`);
        });
    }
}

addAllProducts()
    .then(() => {
        console.log('\n✅ Process completed!');
        return prisma.$disconnect();
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });

