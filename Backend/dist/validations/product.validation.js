"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProductsSchema = exports.getProductSchema = exports.updateProductSchema = exports.createProductSchema = void 0;
const zod_1 = require("zod");
const productBaseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required').max(200),
    unit_id: zod_1.z.string().optional(),
    category_id: zod_1.z.string().optional(),
    purchase_rate: zod_1.z.number().min(0, 'Purchase rate must be positive'),
    sales_rate_exc_dis_and_tax: zod_1.z.number().min(0, 'Sales rate must be positive'),
    sales_rate_inc_dis_and_tax: zod_1.z.number().min(0, 'Sales rate must be positive'),
    description: zod_1.z.string().optional(),
    pct_or_hs_code: zod_1.z.string().optional(),
    sku: zod_1.z.string().optional(),
    discount_amount: zod_1.z.number().min(0).optional(),
    tax_id: zod_1.z.string().optional(),
    subcategory_id: zod_1.z.string().optional(),
    min_qty: zod_1.z.number().int().min(0).optional().default(10),
    max_qty: zod_1.z.number().int().min(0).optional().default(10),
    supplier_id: zod_1.z.string().optional(),
    brand_id: zod_1.z.string().optional(),
    color_id: zod_1.z.string().optional(),
    size_id: zod_1.z.string().optional(),
    is_active: zod_1.z.boolean().optional().default(true),
    display_on_pos: zod_1.z.boolean().optional().default(true),
    is_batch: zod_1.z.boolean().optional().default(false),
    auto_fill_on_demand_sheet: zod_1.z.boolean().optional().default(false),
    non_inventory_item: zod_1.z.boolean().optional().default(false),
    is_deal: zod_1.z.boolean().optional().default(false),
    is_featured: zod_1.z.boolean().optional().default(false),
});
exports.createProductSchema = zod_1.z.object({
    body: productBaseSchema,
});
exports.updateProductSchema = zod_1.z.object({
    body: productBaseSchema.partial(),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Product ID is required'),
    }),
});
exports.getProductSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Product ID is required'),
    }),
});
exports.listProductsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
        category_id: zod_1.z.string().optional(),
        subcategory_id: zod_1.z.string().optional(),
        is_active: zod_1.z.string().optional(),
        display_on_pos: zod_1.z.string().optional(),
        branch_id: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=product.validation.js.map