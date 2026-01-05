import { useState, useEffect, useCallback, useRef } from 'react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  quantity: number;
  category: string;
  discount: number;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

const STORAGE_KEY = 'pos-hold-sales';

/**
 * Custom hook for managing hold sales with localStorage persistence
 * Provides a clean API for holding and retrieving sales
 */
export function useHoldSales() {
  const [holdSales, setHoldSales] = useState<CartItem[][]>(() => {
    // Load from localStorage on initialization
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate that it's an array of arrays
        if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
          console.log('Loaded hold sales from localStorage:', parsed.length, 'sales');
          return parsed;
        } else {
          console.warn('Invalid hold sales data in localStorage, clearing...');
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('Failed to load hold sales from localStorage:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Ignore
      }
    }
    
    return [];
  });

  // Keep a ref to the latest holdSales for callbacks
  const holdSalesRef = useRef(holdSales);
  holdSalesRef.current = holdSales;

  // Sync to localStorage whenever holdSales changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const serialized = JSON.stringify(holdSales);
      localStorage.setItem(STORAGE_KEY, serialized);
      console.log('✅ Hold sales saved to localStorage:', holdSales.length, 'sales');
    } catch (error) {
      console.error('❌ Failed to save hold sales to localStorage:', error);
      // Try to handle quota exceeded error
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('⚠️ localStorage quota exceeded. Consider clearing old hold sales.');
        alert('Storage full! Please delete some saved sales to free up space.');
      }
    }
  }, [holdSales]);

  /**
   * Add current cart to hold sales
   */
  const holdSale = useCallback((cart: CartItem[]) => {
    if (cart.length === 0) {
      console.warn('Cannot hold empty cart');
      return;
    }
    
    setHoldSales((prev) => {
      // Create a deep copy to avoid reference issues
      const newSale = JSON.parse(JSON.stringify(cart));
      const updated = [...prev, newSale];
      console.log('Sale held. Total held sales:', updated.length);
      return updated;
    });
  }, []);

  /**
   * Retrieve a held sale by index
   * Returns the sale and removes it from hold sales
   */
  const retrieveHoldSale = useCallback((index: number, remove: boolean = false): CartItem[] | null => {
    let heldSale: CartItem[] | null = null;
    
    setHoldSales((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      
      heldSale = prev[index];
      // Only remove if explicitly requested
      if (remove) {
        return prev.filter((_, i) => i !== index);
      }
      return prev; // Keep it in the list
    });
    
    // Return a deep copy if sale was found
    return heldSale ? JSON.parse(JSON.stringify(heldSale)) : null;
  }, []);

  /**
   * Delete a held sale by index without retrieving it
   */
  const deleteHoldSale = useCallback((index: number) => {
    setHoldSales((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  /**
   * Clear all hold sales
   */
  const clearAllHoldSales = useCallback(() => {
    setHoldSales([]);
  }, []);

  /**
   * Get hold sale by index without removing it
   */
  const getHoldSale = useCallback((index: number): CartItem[] | null => {
    const current = holdSalesRef.current;
    if (index < 0 || index >= current.length) return null;
    return JSON.parse(JSON.stringify(current[index]));
  }, []);

  return {
    holdSales,
    holdSale,
    retrieveHoldSale,
    deleteHoldSale,
    clearAllHoldSales,
    getHoldSale,
  };
}

