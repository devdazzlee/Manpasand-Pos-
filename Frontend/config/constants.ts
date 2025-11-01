
// For Production 
export const API_BASE = "https://manpasand-pos-beta.vercel.app/api/v1";

// For  Development
// export const API_BASE = "http://localhost:7000/api/v1";

// Print API URL - Separate endpoint for printer operations
// Tries local print server first (localhost:3001), then falls back to backend
export const PRINT_API_BASE = "http://localhost:3001";

// Backend printer endpoint - uses API_BASE when local server is unavailable
// This should point to your backend API, NOT the local server
export const PRINT_API_FALLBACK = `${API_BASE}/barcode-generator`;