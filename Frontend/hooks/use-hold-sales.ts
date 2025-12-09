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
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load hold sales from localStorage:', error);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(holdSales));
    } catch (error) {
      console.error('Failed to save hold sales to localStorage:', error);
    }
  }, [holdSales]);

  /**
   * Add current cart to hold sales
   */
  const holdSale = useCallback((cart: CartItem[]) => {
    if (cart.length === 0) return;
    
    setHoldSales((prev) => {
      // Create a deep copy to avoid reference issues
      const newSale = JSON.parse(JSON.stringify(cart));
      return [...prev, newSale];
    });
  }, []);

  /**
   * Retrieve a held sale by index
   * Returns the sale and removes it from hold sales
   */
  const retrieveHoldSale = useCallback((index: number): CartItem[] | null => {
    let heldSale: CartItem[] | null = null;
    
    setHoldSales((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      
      heldSale = prev[index];
      return prev.filter((_, i) => i !== index);
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

