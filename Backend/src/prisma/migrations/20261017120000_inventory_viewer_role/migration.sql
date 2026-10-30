-- Read-only role: can only view products and stock.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'INVENTORY_VIEWER';
