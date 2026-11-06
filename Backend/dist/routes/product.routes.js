"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../prisma/client");
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = __importDefault(require("express"));
const product_controller_1 = require("../controllers/product.controller");
const product_validation_1 = require("../validations/product.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const multer_1 = __importDefault(require("../utils/multer"));
const parse_formdata_middleware_1 = require("../middleware/parse-formdata.middleware");
const uploadBulk_1 = __importDefault(require("../utils/uploadBulk"));
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const barcode_availability_service_1 = require("../services/barcode-availability.service");
const router = express_1.default.Router();
// router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));
const productWriters = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']);
/** Only edits that actually change cost / sale price / discount need the price permission. */
const priceChangeCheck = async (req) => {
    const fields = ['purchase_rate', 'sales_rate_exc_dis_and_tax', 'sales_rate_inc_dis_and_tax', 'discount_amount'];
    if (!fields.some((f) => req.body?.[f] !== undefined))
        return null;
    const current = await client_1.prisma.product.findUnique({ where: { id: req.params.id }, select: { purchase_rate: true, sales_rate_exc_dis_and_tax: true, sales_rate_inc_dis_and_tax: true, discount_amount: true } });
    if (!current)
        return null;
    const changed = fields.some((f) => req.body?.[f] !== undefined && Math.abs(Number(req.body[f]) - Number(current[f] ?? 0)) > 0.0001);
    return changed ? 'products.price_change' : null;
};
router.post('/', auth_middleware_1.authenticate, productWriters, multer_1.default.array('images', 10), parse_formdata_middleware_1.parseFormData, (0, validation_middleware_1.validate)(product_validation_1.createProductSchema), product_controller_1.createProduct);
router.post('/upload-image', auth_middleware_1.authenticate, productWriters, multer_1.default.single('image'), product_controller_1.uploadProductImage);
router.post('/bulk-upload', auth_middleware_1.authenticate, productWriters, uploadBulk_1.default.single('file'), product_controller_1.bulkUploadProducts);
router.post('/import-row', auth_middleware_1.authenticate, productWriters, product_controller_1.importProductRow);
router.delete('/all', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN']), product_controller_1.deleteAllProducts);
// Every POS product route needs a staff login: these responses carry purchase
// prices, stock and supplier data. The website / customer app read the catalog
// through /web and /customer/app, which serve a public (cost-free) view.
router.get('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validate)(product_validation_1.listProductsSchema), product_controller_1.listProducts);
router.get('/pos-catalog', auth_middleware_1.authenticate, product_controller_1.getPosCatalog);
// Options for the report filter bar, readable by every signed-in role.
router.get('/catalog-filter-options', auth_middleware_1.authenticate, (0, asyncHandler_1.default)(async (_req, res) => {
    const named = { select: { id: true, name: true }, orderBy: { name: 'asc' } };
    const [suppliers, categories, subcategories, links] = await Promise.all([
        client_1.prisma.supplier.findMany(named),
        client_1.prisma.category.findMany(named),
        client_1.prisma.subcategory.findMany(named),
        // Subcategories carry no category of their own; a link is any product using the pair.
        client_1.prisma.product.findMany({
            where: { subcategory_id: { not: null } },
            select: { category_id: true, subcategory_id: true },
            distinct: ['category_id', 'subcategory_id'],
        }),
    ]);
    new apiResponse_1.ApiResponse({
        suppliers,
        categories,
        subcategories,
        links: links.map((l) => ({ categoryId: l.category_id, subcategoryId: l.subcategory_id })),
    }, 'Catalog filter options').send(res);
}));
// Live check for the product form: is this custom barcode free? (+ next free suggestion)
router.get('/barcode-availability', auth_middleware_1.authenticate, (0, asyncHandler_1.default)(async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code)
        return new apiResponse_1.ApiResponse({ code, available: false, usedBy: null, suggestion: null }, 'Enter a code').send(res);
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
    new apiResponse_1.ApiResponse(await (0, barcode_availability_service_1.barcodeAvailability)(code, excludeId), 'Barcode availability').send(res);
}));
router.get('/export/excel', auth_middleware_1.authenticate, product_controller_1.exportProductsToExcel);
router.get('/featured', auth_middleware_1.authenticate, product_controller_1.getFeaturedProducts);
router.get('/best-selling', auth_middleware_1.authenticate, product_controller_1.getBestSellingProducts);
router.get('/:id/cost-history', auth_middleware_1.authenticate, (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.getProductCostHistory);
router.get('/:id/price-history', auth_middleware_1.authenticate, (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.getProductPriceHistory);
router.get('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.getProduct);
router.patch('/:id', auth_middleware_1.authenticate, productWriters, (0, validation_middleware_1.validate)(product_validation_1.updateProductSchema), (0, permission_middleware_1.requirePermission)(priceChangeCheck), product_controller_1.updateProduct);
router.patch('/:id/toggle-status', auth_middleware_1.authenticate, productWriters, (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.toggleProductStatus);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']), (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.deleteProduct);
exports.default = router;
//# sourceMappingURL=product.routes.js.map