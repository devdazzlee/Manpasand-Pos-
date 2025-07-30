# Bulk Upload Guide

## Overview
The bulk upload feature allows you to import multiple products at once using CSV or Excel files. The system now supports creating units, categories, and other related entities automatically based on names provided in the sheet.

## Supported File Formats
- CSV (.csv)
- Excel (.xlsx, .xls)

## Required Columns
These columns are **mandatory** and must be present in your file:
- `name` - Product name
- `purchase_rate` - Purchase price
- `sales_rate_exc_dis_and_tax` - Sales price excluding discount and tax
- `sales_rate_inc_dis_and_tax` - Sales price including discount and tax

## Optional Columns

### Basic Product Information
- `description` - Product description
- `pct_or_hs_code` - Product code
- `sku` - Stock keeping unit (auto-generated if not provided)
- `discount_amount` - Discount amount (default: 0)
- `min_qty` - Minimum quantity (default: 10)
- `max_qty` - Maximum quantity (default: 10)

### Boolean Flags
- `is_active` - Whether product is active (default: true)
- `display_on_pos` - Whether to display on POS (default: true)
- `is_batch` - Whether product uses batch tracking (default: false)
- `auto_fill_on_demand_sheet` - Auto-fill on demand sheet (default: false)
- `non_inventory_item` - Whether it's a non-inventory item (default: false)
- `is_deal` - Whether it's a deal product (default: false)
- `is_featured` - Whether it's a featured product (default: false)

### Relation Names (NEW!)
Instead of providing IDs, you can now provide **names** for related entities. The system will:
1. Look for existing entities with that name
2. Create new entities if they don't exist
3. Use "Unknown" entities if no name is provided

#### Supported Relation Name Columns:
- `unit_name` - Unit name (e.g., "Pieces", "Kg", "Boxes")
- `category_name` - Category name (e.g., "Electronics", "Food", "Clothing")
- `subcategory_name` - Subcategory name (e.g., "Smartphones", "Beverages", "T-Shirts")
- `tax_name` - Tax name (e.g., "VAT", "GST", "Tax")
- `supplier_name` - Supplier name (e.g., "Supplier A", "Supplier B")
- `brand_name` - Brand name (e.g., "Brand X", "Brand Y")
- `color_name` - Color name (e.g., "Black", "Red", "Blue")
- `size_name` - Size name (e.g., "Large", "Medium", "Small")

## How It Works

### For Units (and other relations):
1. **If you provide a unit name** (e.g., "Pieces"):
   - System looks for existing unit with name "Pieces"
   - If found, uses that unit
   - If not found, creates a new unit with name "Pieces"

2. **If you leave unit name empty**:
   - System uses the "Unknown" unit (created automatically)

3. **If you provide an invalid/empty name**:
   - System uses the "Unknown" unit

## Example CSV Format

```csv
name,purchase_rate,sales_rate_exc_dis_and_tax,sales_rate_inc_dis_and_tax,unit_name,category_name,tax_name
"Product A",100.00,120.00,130.00,"Pieces","Electronics","VAT"
"Product B",50.00,60.00,65.00,"Kg","Food","GST"
"Product C",200.00,250.00,270.00,"Boxes","Clothing","Tax"
```

## Example Excel Format
Same columns as CSV, but in Excel format.

## API Endpoint
```
POST /api/products/bulk-upload
Content-Type: multipart/form-data

file: [your CSV/Excel file]
```

## Response Format
```json
{
  "success": true,
  "message": "Bulk upload completed",
  "data": [
    {
      "success": true,
      "id": "product-id-1",
      "name": "Product A",
      "unit": "Pieces",
      "category": "Electronics"
    },
    {
      "success": false,
      "error": "Missing required fields",
      "data": { /* original row data */ }
    }
  ]
}
```

## Tips

1. **Use descriptive names**: Instead of "Unit1", use "Pieces", "Kilograms", "Boxes", etc.
2. **Be consistent**: Use the same names across multiple uploads to reuse existing entities
3. **Test with small files**: Start with a few products to test the format
4. **Check the response**: The API returns detailed information about each product creation attempt

## Error Handling
- Missing required fields will cause individual row failures
- Invalid data types (non-numeric prices) will cause failures
- Duplicate SKUs will cause failures
- The system continues processing other rows even if some fail

## Automatic Entity Creation
When you provide names for units, categories, etc., the system automatically:
- Generates unique codes for new entities
- Sets them as active and visible on POS
- Creates them within the same transaction as the product
- Ensures data consistency 