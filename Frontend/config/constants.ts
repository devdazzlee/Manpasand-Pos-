// For Production
export const API_BASE = "https://api.manpasandstore.com/api/v1";
// Old (Vercel): "https://manpasand-pos-beta.vercel.app/api/v1"

// For Development
// export const API_BASE = "http://localhost:9000/api/v1";

/** Ace Studios footer on thermal receipts (not the store WhatsApp line). */
export const ACE_STUDIOS_CONTACT = "+92 336 2500357";

export const PEHNAWA_DEFAULT_STORE_ADDRESS = "Karachi, Pakistan";

/** Shown on product barcode labels before the product name (e.g. MANPASAND DATES). */
export const BARCODE_LABEL_BRAND_PREFIX = "MANPASAND";

/** Bill only while the branch cash register is open. Off for Manpasand (keep in sync with Backend/src/config/pos-rules.ts). */
export const REQUIRE_OPEN_REGISTER_FOR_SALE = false;

/** Stitched / Unstitched product type (a clothing filter). Off for Manpasand. */
export const SHOW_STITCH_TYPE = false;

/** Sale receipt footer — not shown on product barcode labels. */
export const RECEIPT_EXCHANGE_POLICY_TITLE = "EXCHANGE POLICY";
// Manpasand prints no exchange policy; add lines here to show one on receipts.
export const RECEIPT_EXCHANGE_POLICY_LINES: readonly string[] = [];

// Print API URL - Separate endpoint for printer operations
// Tries local print server first (localhost:3001), then falls back to backend
export const PRINT_API_BASE = "http://localhost:3001";

// Backend printer endpoint - uses API_BASE when local server is unavailable
// This should point to your backend API, NOT the local server
export const PRINT_API_FALLBACK = `${API_BASE}/barcode-generator`;

// API Endpoints
export const API_ENDPOINTS = {
  PRODUCTS: `${API_BASE}/products`, // GET - Paginated product list
  PRODUCT_EXPORT_EXCEL: `${API_BASE}/products/export/excel`, // GET - Export filtered products to Excel
  PRODUCTS_PUBLIC: `${API_BASE}/customer/app/products`, // GET - Search/get products (public/customer)
  PRODUCT_FEATURED: `${API_BASE}/products/featured`, // GET - Get featured products
  PRODUCT_BEST_SELLING: `${API_BASE}/products/best-selling`, // GET - Get best selling products
  PRODUCT_BY_ID: (id: string) => `${API_BASE}/products/${id}`, // GET - Get product by ID
};