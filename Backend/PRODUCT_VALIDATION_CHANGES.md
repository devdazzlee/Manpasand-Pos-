# Product Validation and Service Changes

## Summary of Changes

This document outlines the changes made to the product validation and service to implement the following requirements:

1. **Required Fields Only**: Only `name`, `purchase_rate`, and `sales_rate_exc_dis_and_tax` are now required
2. **Optional Fields**: All other fields are now optional, including `unit_id` and `category_id`
3. **Default Values**: `min_qty` and `max_qty` default to 10 if not provided
4. **Unknown Entries**: Missing ID fields automatically create "Unknown" entries in their respective tables
5. **Auto-Generated SKU**: SKU is automatically generated if not provided
6. **Fixed Prisma Errors**: Resolved database schema compatibility issues
7. **Transaction Fix**: Fixed foreign key constraint errors by ensuring atomic operations
8. **Proper Prisma Relations**: Fixed issue with foreign key field syntax by using nested relations

## Files Modified

### 1. `src/validations/product.validation.ts`

**Changes Made:**
- Made `name`, `purchase_rate`, and `sales_rate_exc_dis_and_tax` required
- Made `unit_id` optional (was previously required)
- Made `category_id` optional (was previously required)
- Made `sku` optional (was previously required)
- Set default values for `min_qty` and `max_qty` to 10
- All other fields remain optional with their existing defaults

**Before:**
```typescript
unit_id: z.string().min(1, 'Unit is required'),
sku: z.string().min(1, 'SKU is required'),
category_id: z.string().min(1, 'Category is required'),
min_qty: z.number().int().min(0).nullable().optional(),
max_qty: z.number().int().min(0).nullable().optional(),
```

**After:**
```typescript
unit_id: z.string().optional(),
sku: z.string().optional(),
category_id: z.string().optional(),
min_qty: z.number().int().min(0).optional().default(10),
max_qty: z.number().int().min(0).optional().default(10),
```

### 2. `src/services/product.service.ts`

**New Methods Added:**

#### `getOrCreateUnknownEntry(modelName: string, codePrefix: string, tx?: any)`
- Creates "Unknown" entries for missing ID fields
- Generates unique slugs for categories (subcategories don't have slug field)
- Handles different model requirements (e.g., tax percentage)
- **Fixed**: Now properly handles different model schemas to avoid Prisma errors
- **Enhanced**: Accepts transaction context for atomic operations

#### `generateSKU(productName: string): Promise<string>`
- Generates unique SKU based on product name and timestamp
- Adds random suffix if SKU already exists
- Format: `{NAME_PREFIX}{TIMESTAMP}` or `{NAME_PREFIX}{TIMESTAMP}{RANDOM_SUFFIX}`

#### `buildUpdateProductData(data: UpdateProductInput)`
- Handles partial updates properly
- Only updates fields that are provided
- Converts Decimal values appropriately

#### `buildUpdateRelationData(data: UpdateProductInput, tx?: any)`
- Handles relation updates for partial updates
- Creates unknown entries for empty/null ID values
- Only processes fields that are explicitly provided
- **Enhanced**: Accepts transaction context for atomic operations

**Modified Methods:**

#### `buildProductData()`
- Updated to use default values for `min_qty` and `max_qty`
- SKU is now handled separately in `createProduct()`
- **Enhanced**: Filters out undefined values to avoid Prisma validation errors

#### `buildRelationData(data: CreateProductInput, tx?: any)`
- Now creates unknown entries for missing ID fields (including unit_id and category_id)
- Made async to handle database operations
- **Enhanced**: Accepts transaction context for atomic operations

#### `createProduct()`
- Auto-generates SKU if not provided
- Uses new relation building logic
- Handles unknown entry creation for all missing ID fields
- **Fixed**: All operations now happen within a single transaction
- **Fixed**: Uses proper Prisma nested relations syntax

#### `updateProduct()`
- Uses new update-specific methods
- Handles partial updates properly
- Creates unknown entries for missing ID fields
- **Enhanced**: Now uses transactions for atomic operations

## How It Works

### Creating a Product with Minimal Data

**Input:**
```json
{
  "name": "Test Product",
  "purchase_rate": 100,
  "sales_rate_exc_dis_and_tax": 120,
  "sales_rate_inc_dis_and_tax": 130
}
```

**Result:**
- Product created successfully
- SKU auto-generated (e.g., "TES123456")
- `min_qty` and `max_qty` set to 10
- All other fields use their default values
- "Unknown" entries created for all missing ID fields including:
  - Unit (if unit_id not provided)
  - Category (if category_id not provided)
  - Tax (if tax_id not provided)
  - Supplier (if supplier_id not provided)
  - Brand (if brand_id not provided)
  - Color (if color_id not provided)
  - Size (if size_id not provided)
  - Subcategory (if subcategory_id not provided)

### Creating a Product with Missing Unit and Category

**Input:**
```json
{
  "name": "Product Without Unit and Category",
  "purchase_rate": 100,
  "sales_rate_exc_dis_and_tax": 120,
  "sales_rate_inc_dis_and_tax": 130
  // unit_id and category_id not provided
}
```

**Result:**
- Product created successfully
- "Unknown" unit created automatically
- "Unknown" category created automatically
- Product linked to both "Unknown" entries
- All other missing ID fields also create "Unknown" entries

### Creating a Product with Missing ID Fields

**Input:**
```json
{
  "name": "Product Without Tax",
  "purchase_rate": 100,
  "sales_rate_exc_dis_and_tax": 120,
  "sales_rate_inc_dis_and_tax": 130
  // tax_id, supplier_id, brand_id, etc. not provided
}
```

**Result:**
- Product created successfully
- "Unknown" entries created for:
  - Unit (if unit_id not provided)
  - Category (if category_id not provided)
  - Tax (if tax_id not provided)
  - Supplier (if supplier_id not provided)
  - Brand (if brand_id not provided)
  - Color (if color_id not provided)
  - Size (if size_id not provided)
  - Subcategory (if subcategory_id not provided)

### Updating a Product

**Input:**
```json
{
  "name": "Updated Product Name",
  "unit_id": null  // Remove unit association
}
```

**Result:**
- Product name updated
- Unit association removed and replaced with "Unknown" unit entry
- All other fields remain unchanged

## Benefits

1. **Simplified Product Creation**: Users only need to provide essential information
2. **Automatic Data Integrity**: Missing relationships are handled gracefully
3. **Unique SKU Generation**: No manual SKU management required
4. **Consistent Defaults**: Predictable behavior for optional fields
5. **Backward Compatibility**: Existing functionality preserved
6. **Flexible Unit and Category Management**: Products can be created without specifying units or categories
7. **Database Schema Compatibility**: Fixed Prisma errors for different model structures
8. **Atomic Operations**: All database operations are transactional and consistent
9. **Proper Prisma Syntax**: Uses correct nested relations instead of foreign key fields

## Testing

The changes have been tested with various scenarios:
- ✅ Minimal required fields only (without unit_id and category_id)
- ✅ With unit_id but no category_id
- ✅ With category_id but no unit_id
- ✅ With both unit_id and category_id provided
- ✅ Missing required fields (validation fails)
- ✅ All fields provided
- ✅ Custom min_qty and max_qty values
- ✅ Default values applied correctly
- ✅ Transaction atomicity (all operations succeed or fail together)
- ✅ Proper Prisma syntax (no "Unknown argument" errors)

## Database Impact

- New "Unknown" entries will be created in related tables as needed
- These entries have unique slugs to avoid conflicts (where applicable)
- All "Unknown" entries are marked as active and display_on_pos = true
- Existing data remains unaffected
- Unit and Category tables will have "Unknown" entries for products without units/categories
- **Fixed**: Subcategory creation no longer fails due to missing slug field
- **Fixed**: Foreign key constraint errors resolved through transaction management
- **Fixed**: Prisma validation errors resolved through proper nested relations syntax

## Technical Fixes

### Prisma Error Resolution
- **Issue**: Subcategory model doesn't have a `slug` field, but the code was trying to set it
- **Solution**: Updated `getOrCreateUnknownEntry()` method to handle different model schemas correctly
- **Implementation**: Used switch statement to apply model-specific fields only where they exist

### Transaction Fix
- **Issue**: Foreign key constraint errors when creating "Unknown" entries and products in separate operations
- **Solution**: All operations now happen within a single transaction
- **Implementation**: 
  - Added transaction parameter to `getOrCreateUnknownEntry()` and `buildRelationData()`
  - Updated `createProduct()` and `updateProduct()` to use transactions
  - Ensures atomic operations (all succeed or all fail)

### Prisma Relations Syntax Fix
- **Issue**: "Unknown argument `unit_id`. Did you mean `unit`?" error when trying to set foreign key fields directly
- **Solution**: Use proper Prisma nested relations syntax instead of foreign key fields
- **Implementation**:
  - Use `unit: { connect: { id: "..." } }` instead of `unit_id: "..."`
  - Use `category: { connect: { id: "..." } }` instead of `category_id: "..."`
  - All relations use the same nested connect pattern
  - This properly overrides schema defaults and follows Prisma best practices

### Model-Specific Field Handling
- **Category**: Includes `slug` field with unique timestamp
- **Subcategory**: No `slug` field, uses base data only
- **Tax**: Includes `percentage: 0` field
- **Other models**: Use base data only (name, code, is_active, display_on_pos)

### TypeScript Error Resolution
- **Issue**: TypeScript errors when adding properties to typed objects
- **Solution**: Used `any` type for model data objects to allow dynamic property assignment
- **Implementation**: `let modelData: any = { ... }` with direct property assignment

### Undefined Value Filtering
- **Issue**: Prisma validation errors when undefined values are passed
- **Solution**: Filter out undefined values before passing to Prisma
- **Implementation**: Only add optional fields to product data if they have defined values 