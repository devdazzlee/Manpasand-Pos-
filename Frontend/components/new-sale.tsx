"use client";

import { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLoading } from "@/hooks/use-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Scan,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { offlineAPIClient } from "@/lib/offline-api-client";
import { offlineDB } from "@/lib/offline-db";
import { syncManager } from "@/lib/offline-sync";
import { usePosData } from "@/hooks/use-pos-data";
import { printReceiptViaServer, getPrinters, type ReceiptData } from "@/lib/print-server";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHoldSales } from "@/hooks/use-hold-sales";

interface CartItem {
  id: string; // Unique cart item ID (product.id + timestamp for separate entries)
  productId?: string; // Original product ID for reference (optional for backward compatibility)
  name: string;
  price: number; // Display price (barcode price if scanned, otherwise original price)
  originalPrice: number; // Original product price (used for line total calculations)
  actualUnitPrice: number; // Actual unit price for calculations (always original product price)
  quantity: number;
  category: string;
  discount: number;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  categoryId: string;
  barcode?: string;
  code?: string; // Product code for barcode matching
  sku?: string; // SKU for barcode matching
  available_stock?: number;
  current_stock?: number;
  reserved_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  unitId?: string;
  unitName?: string;
}

interface Printer {
  name: string;
  isDefault?: boolean;
  status?: string;
  receiptProfile?: {
    roll: '80mm' | '58mm';
    printableWidthMM: number;
    columns: { fontA: number; fontB: number };
  };
  languageHint?: 'escpos' | 'zpl' | 'generic';
}


export function NewSale() {
  const [cart, setCart] = useState<CartItem[]>([]);
  // Track input values as strings to allow decimal point typing
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethodPending, setPaymentMethodPending] = useState<"Cash" | "Card" | null>(null);
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [calculatedChange, setCalculatedChange] = useState(0);
  const [paymentError, setPaymentError] = useState("");
  const { holdSales, holdSale, retrieveHoldSale } = useHoldSales();
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [discountInput, setDiscountInput] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Refs for price and quantity inputs for keyboard navigation
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastAddedProductId = useRef<string | null>(null);
  // Refs for cart items and scrollable container
  const cartItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cartScrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Ref to track scan timeout for rapid scanning
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to prevent duplicate processing of the same scan
  const lastProcessedScanRef = useRef<string>('');
  const isProcessingScanRef = useRef<boolean>(false);
  const enterKeyPressedRef = useRef<boolean>(false);
  // Track when user is actively interacting with other inputs (prevent auto-refocus)
  const userInteractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef<boolean>(false);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(
    null
  );
  const { loading: paymentLoading, withLoading: withPaymentLoading } =
    useLoading();
  const [scanLoading, setScanLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [savedPrinterObj, setSavedPrinterObj] = useState<Printer | null>(() => {
    // Load saved printer object from localStorage on initial state
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('savedPrinter');
      if (saved) {
        try {
          const printer = JSON.parse(saved);
          return printer;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    // Load saved printer name for dropdown
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('savedPrinter');
      if (saved) {
        try {
          const printer = JSON.parse(saved);
          return printer.name || "";
        } catch (e) {
          return "";
        }
      }
    }
    return "";
  });
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [showHeldSales, setShowHeldSales] = useState(false);

  // Save selected printer object to localStorage whenever it changes
  useEffect(() => {
    if (savedPrinterObj) {
      localStorage.setItem('savedPrinter', JSON.stringify(savedPrinterObj));
      // Also update selectedPrinter name for the dropdown
      setSelectedPrinter(savedPrinterObj.name);
    }
  }, [savedPrinterObj]);


  const [branchName, setBranchName] = useState({
    name: "",
    address: "",
  });
  // Global store with custom hook
  const {
    products,
    categories,
    customers,
    productsLoading,
    categoriesLoading,
    customersLoading,
    isAnyLoading,
    fetchProducts,
    fetchCategories,
    fetchCustomers,
  } = usePosData();
  // Fetch initial data and focus search input
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      if (!mounted) return;

      try {
        await Promise.all([
          fetchProducts(),
          fetchCategories(),
          fetchCustomers(),
          getBranchName(),
          loadPrinters(),
        ]);
      } catch (error) {
        // Error loading data - no toast shown
      }
    };

    fetchData();

    // Focus the search input
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    // Cleanup function to prevent memory leaks and state updates after unmount
    return () => {
      mounted = false;
      // Clear scan timeout on unmount
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };
  }, []); // Empty dependency array since we only want to fetch once on mount

  // Keep search input always focused (professional POS behavior)
  // Uses intelligent focus management: only refocuses when user is idle
  useEffect(() => {
    const IDLE_TIMEOUT = 2000; // 2 seconds of inactivity before refocusing search
    const INTERACTION_TIMEOUT = 500; // 500ms to detect if user is still interacting

    const markUserInteracting = () => {
      isUserInteractingRef.current = true;
      // Clear any pending refocus
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
        userInteractionTimeoutRef.current = null;
      }
      // Reset interaction flag after a short delay
      setTimeout(() => {
        isUserInteractingRef.current = false;
      }, INTERACTION_TIMEOUT);
    };

    const isInteractiveElement = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      
      // Check data attributes for special inputs
      if (element.getAttribute('data-price-input') === 'true' ||
          element.getAttribute('data-quantity-input') === 'true' ||
          element.getAttribute('data-discount-input') === 'true' ||
          element.getAttribute('data-discount-select') === 'true') {
        return true;
      }
      
      // Check element types
      const tagName = element.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }
      
      // Check if it's inside a select dropdown (for Radix UI or custom selects)
      if (element.closest('[role="listbox"]') || 
          element.closest('[role="combobox"]') ||
          element.closest('[data-radix-select-content]') ||
          element.closest('select')) {
        return true;
      }
      
      // Check if it's a button (but allow clicking buttons)
      if (tagName === 'BUTTON' || element.closest('button')) {
        return true;
      }
      
      return false;
    };

    const scheduleRefocus = () => {
      // Clear any existing timeout
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
      
      // Only refocus if user is not actively interacting
      if (!isUserInteractingRef.current && searchInputRef.current && !paymentDialogOpen) {
        userInteractionTimeoutRef.current = setTimeout(() => {
          const activeElement = document.activeElement as HTMLElement;
          
          // Don't refocus if user is still on an interactive element
          if (!isInteractiveElement(activeElement) && activeElement !== searchInputRef.current) {
            if (searchInputRef.current && !paymentDialogOpen) {
              searchInputRef.current.focus();
            }
          }
        }, IDLE_TIMEOUT);
      }
    };

    // Refocus on click anywhere (but respect interactive elements)
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // If clicking on interactive element, mark as interacting
      if (isInteractiveElement(target)) {
        markUserInteracting();
        return;
      }
      
      // Schedule refocus after idle period
      scheduleRefocus();
    };

    // Refocus when window regains focus (tab switching back)
    const handleFocus = () => {
      scheduleRefocus();
    };

    // Global keyboard listener to capture barcode scans even when search is not focused
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if in payment dialog
      if (paymentDialogOpen) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      
      // If typing in any interactive input (price/quantity/discount), allow it
      if (isInteractiveElement(activeElement)) {
        markUserInteracting();
        return;
      }
      
      // If typing anywhere else (or search is not focused), focus search and capture the key
      if (searchInputRef.current) {
        // If it's a printable character (not a control key)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          // If search is not focused, focus it and append the character
          if (activeElement !== searchInputRef.current) {
            e.preventDefault();
            e.stopPropagation();
            searchInputRef.current.focus();
            // Append the character to the input value
            const currentValue = searchInputRef.current.value || '';
            searchInputRef.current.value = currentValue + e.key;
            // Trigger onChange manually to update state
            const event = new Event('input', { bubbles: true });
            searchInputRef.current.dispatchEvent(event);
            // Also update state directly
            setSearchTerm(currentValue + e.key);
          }
        }
        // Handle Enter key - process the scan
        else if (e.key === 'Enter' && activeElement !== searchInputRef.current) {
          const currentValue = searchInputRef.current.value || '';
          if (currentValue.trim().length > 0) {
            e.preventDefault();
            e.stopPropagation();
            searchInputRef.current.focus();
            handleScannerInput(currentValue);
          }
        }
      }
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // Initial focus
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      // Clear timeout on unmount
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
    };
  }, [paymentDialogOpen]);

  // Client-side filtering for instant search results
  // This provides instant feedback without API calls
  const filteredProducts = products.filter((product) => {
    // Filter by category
    const matchesCategory =
      selectedCategory === "all" || product.categoryId === selectedCategory;

    // Filter by search term (client-side)
    const matchesSearch = !searchTerm || (() => {
      const searchLower = searchTerm.toLowerCase().trim();
      if (searchLower.length === 0) return true;
      
      // Search in name, barcode, SKU
      const nameMatch = product.name?.toLowerCase().includes(searchLower);
      const barcodeMatch = product.barcode?.toLowerCase().includes(searchLower);
      const skuMatch = product.sku?.toLowerCase().includes(searchLower);
      
      return nameMatch || barcodeMatch || skuMatch;
    })();

    return matchesCategory && matchesSearch;
  });

  const addToCart = (product: Product, quantity: number = 1, customPrice?: number) => {
    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    const availableStock = product.available_stock ?? product.stock
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 0
    if (currentQuantity >= availableStock) {
      toast({
        variant: "destructive",
        title: "Insufficient Stock",
        description: `Only ${availableStock} units available for ${product.name}`,
      })
      return
    }
    */

    // When custom price is provided, it represents the TOTAL PRICE from barcode
    // Calculate quantity: barcodePrice / originalPrice
    // Original price is the price of 1 unit
    // Barcode price is the total price
    const originalProductPrice = product.price;
    
    // Calculate quantity from scanned price if custom price is provided
    let finalQuantity = quantity;
    let displayPrice = originalProductPrice; // Price to display in price field
    let actualUnitPrice = originalProductPrice; // Actual unit price for line total calculations (always original)
    
    if (customPrice !== undefined && originalProductPrice > 0) {
      // Calculate quantity: barcodePrice / originalPrice
      finalQuantity = customPrice / originalProductPrice;
      finalQuantity = Math.max(0.01, finalQuantity); // Ensure minimum quantity
      
      // Show the scanned price (barcode value) in the price field for display
      displayPrice = customPrice; // Display barcode price in price field
      // But keep actualUnitPrice as original for calculations
      actualUnitPrice = originalProductPrice; // Always use original price for line total
    } else {
      // If no custom price, ensure minimum quantity of 1
      finalQuantity = Math.max(1, quantity);
    }
    
    console.log('addToCart - Barcode price:', customPrice, 'Original price:', originalProductPrice, 'Calculated quantity:', finalQuantity, 'Display price:', displayPrice, 'Actual unit price:', actualUnitPrice);

    // Always create a NEW separate line item for each scan (don't increment existing)
    // Generate unique ID for each scan to allow multiple separate entries
    const uniqueCartItemId = `${product.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Use functional state update to avoid stale closure issues
    setCart((prevCart) => [
      ...prevCart,
      {
        id: uniqueCartItemId, // Unique ID for this cart entry (each scan = new entry)
        productId: product.id, // Store original product ID for reference
        name: product.name,
        price: displayPrice, // Display price (barcode price if scanned, otherwise original)
        originalPrice: originalProductPrice, // Store original product price
        actualUnitPrice: actualUnitPrice, // Actual unit price for line total calculations
        quantity: finalQuantity, // Calculated quantity (barcodePrice / originalPrice)
        category: product.category,
        discount: 0,
        unitId: product.unitId,
        unitName: product.unitName,
        unit: product.unitName,
      },
    ]);

    lastAddedProductId.current = uniqueCartItemId;
    
    // Use startTransition for non-urgent UI updates (scroll, focus) - doesn't block main thread
    startTransition(() => {
      // Instant scroll to newly added item (use unique cart item ID)
      setTimeout(() => {
        const cartItem = cartItemRefs.current[uniqueCartItemId];
        if (cartItem && cartScrollContainerRef.current) {
          cartItem.scrollIntoView({ 
            behavior: 'auto', // Instant scroll
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 0);

      // DISABLED: Auto-focus on price input - removed to prevent interference with scanning
      // Keep focus on search input for rapid scanning
      /*
      if (customPrice === undefined) {
        setTimeout(() => {
          const priceInput = priceInputRefs.current[uniqueCartItemId];
          if (priceInput) {
            priceInput.focus();
            priceInput.select();
          }
        }, 0);
      }
      */
    });

    // Toast removed as per user request - no toast when selecting products
  };

  // Helper function to format quantity with unit
  const formatQuantityWithUnit = (quantity: number, unitName?: string): string => {
    if (!unitName) return quantity.toFixed(2);
    
    const unitLower = unitName.toLowerCase();
    const qty = quantity;
    
    // For weight units (kgs, kg, kilograms)
    if (unitLower.includes('kg') || unitLower.includes('kilogram')) {
      if (qty >= 1) {
        return `${qty.toFixed(2)} kg`;
      } else {
        // Convert to grams for values less than 1kg
        const grams = qty * 1000;
        return `${grams.toFixed(0)} g`;
      }
    }
    
    // For gram units
    if (unitLower.includes('gram') || unitLower === 'g') {
      if (qty >= 1000) {
        const kg = qty / 1000;
        return `${kg.toFixed(2)} kg`;
      } else {
        return `${qty.toFixed(0)} g`;
      }
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return `${qty.toFixed(0)} pcs`;
    }
    
    // For other units, show with unit name
    return `${qty.toFixed(2)} ${unitName}`;
  };

  // Helper function to get quantity increment based on unit
  const getQuantityIncrement = (unitName?: string): number => {
    if (!unitName) return 1;
    const unitLower = unitName.toLowerCase();
    
    // For weight units (kgs, kg, kilograms, gram, grams, g)
    if (unitLower.includes('kg') || unitLower.includes('kilogram') || 
        unitLower.includes('gram') || unitLower === 'g') {
      // Increment by 0.1 (100 grams) for weight units
      return 0.1;
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return 1;
    }
    
    // Default increment
    return 1;
  };

  const updateQuantity = (id: string, change: number) => {
    const item = cart.find((item) => item.id === id);
    // Find product by productId if item has it, otherwise fallback to id (for backward compatibility)
    const product = item && (item as any).productId 
      ? products.find((p) => p.id === (item as any).productId)
      : products.find((p) => p.id === id);

    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    if (item && product) {
      const newQuantity = item.quantity + change
      const availableStock = product.available_stock ?? product.stock

      if (newQuantity > availableStock) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `Only ${availableStock} units available`,
        })
        return
      }
    }
    */

    // Get unit-aware increment
    const unitName = item?.unitName || item?.unit || product?.unitName;
    const increment = getQuantityIncrement(unitName);
    const actualChange = change > 0 ? increment : -increment;

    setCart(
      cart.map((item) => {
        if (item.id === id) {
          const newQuantity = Number(item.quantity) + actualChange;
          return { ...item, quantity: Math.max(0.01, newQuantity) };
        }
        return item;
      })
    );
  };

  const updateQuantityManual = (id: string, newQuantity: number) => {
    // Ensure quantity is valid (>= 0.01)
    const validQuantity = Math.max(0.01, Number(newQuantity));
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: validQuantity };
        }
        return item;
      })
    );
  };

  const updateItemPrice = (id: string, newPrice: number) => {
    // Ensure price is valid (>= 0)
    const validPrice = Math.max(0, Number(newPrice));
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, price: validPrice };
        }
        return item;
      })
    );
  };

  const updateItemDiscount = (id: string, discountPercentage: number) => {
    if (discountPercentage < 0 || discountPercentage > 100) return;
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          const discountAmount =
            (item.originalPrice * discountPercentage) / 100;
          return {
            ...item,
            discount: discountPercentage,
            price: item.originalPrice - discountAmount,
          };
        }
        return item;
      })
    );
  };

  const holdCurrentSale = () => {
    if (cart.length === 0) {
      return;
    }
    holdSale(cart);
    setCart([]);
  };

  const handleRetrieveHoldSale = (index: number) => {
    if (cart.length > 0) {
      const shouldReplace = window.confirm(
        "Current cart will be replaced. Continue?"
      );
      if (!shouldReplace) return;
    }
    const heldSale = retrieveHoldSale(index);
    if (heldSale) {
      setCart(heldSale);
    }
  };

  const getBranchName = async () => {
    try {
      const branchId = localStorage.getItem("branch");
      const userRole = localStorage.getItem("role");
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
      
      // Skip for admin users or if branch is "Not Found"
      if (!branchId || branchId === "Not Found" || isAdmin) {
        setBranchName({
          name: "Admin",
          address: "",
        });
        return;
      }

      const data = await apiClient.get(`/branches/${branchId}`); // axios-style
      setBranchName({
        name: data.data.data.name || "",
        address: data.data.data.address || "",
      });
      // setBranchName(data.data.data.name);
      console.log("data", data.data);
      // return data?.name ?? null; // or just `return data` if you need the whole object
    } catch (err) {
      console.error("Failed to fetch branch name:", err);
      return null;
    }
  };

  const loadPrinters = async () => {
    try {
      // Use print server function - tries local server first, then backend
      const result = await getPrinters();
      
      if (result.success && result.data) {
        const printerList = result.data;
        setPrinters(printerList);

        // Try to restore saved printer object from localStorage first
        const savedPrinterStr = localStorage.getItem('savedPrinter');
        if (savedPrinterStr) {
          try {
            const savedPrinter: Printer = JSON.parse(savedPrinterStr);
            // Check if saved printer still exists in the list
            const foundPrinter = printerList.find((p: Printer) => p.name === savedPrinter.name);
            if (foundPrinter) {
              // Use the current printer data from API (in case it was updated)
              setSavedPrinterObj(foundPrinter);
              setSelectedPrinter(foundPrinter.name);
              return;
            }
          } catch (e) {
            console.error("Failed to parse saved printer:", e);
          }
        }
        
        // No saved printer or saved printer not found, use default
        const defaultPrinter = printerList.find((p: Printer) => p.isDefault);
        if (defaultPrinter) {
          setSavedPrinterObj(defaultPrinter);
          setSelectedPrinter(defaultPrinter.name);
        } else if (printerList.length > 0) {
          setSavedPrinterObj(printerList[0]);
          setSelectedPrinter(printerList[0].name);
        }
      } else {
        throw new Error(result.error || 'Failed to get printers');
      }
    } catch (err) {
      console.error("Failed to load printers:", err);
      // Failed to load printers - no toast shown
    }
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
    0
  );

  const discountAmount =
    globalDiscountType === "percentage"
      ? (subtotal * globalDiscount) / 100
      : globalDiscount;

  const total = Math.max(0, subtotal - discountAmount);
  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  useEffect(() => {
    if (!paymentDialogOpen) {
      return;
    }

    const numericValue = parseFloat(tenderedAmount);
    if (Number.isNaN(numericValue)) {
      setCalculatedChange(0);
      return;
    }

    setCalculatedChange(Math.max(0, numericValue - total));
  }, [paymentDialogOpen, tenderedAmount, total]);

  const generateTransactionId = () => {
    return `TXN${Date.now().toString().slice(-6)}`;
  };

  const generateReceiptData = (
    transactionId: string,
    paymentMethod: string,
    cart: CartItem[],
    subtotal: number,
    total: number,
    amountPaid: number,
    changeAmount: number,
    discount?: number
  ) => {
    return {
      transactionId,
      timestamp: new Date().toISOString(),
      items: cart,
      subtotal,
      total,
      paymentMethod,
      cashier: "Muhammad",
      store: "MANPASAND Store #001",
      amountPaid,
      changeAmount,
      discount,
    };
  };


  const resetPaymentState = () => {
    setPaymentDialogOpen(false);
    setPaymentMethodPending(null);
    setTenderedAmount("");
    setCalculatedChange(0);
    setPaymentError("");
  };

  const handlePaymentDialogOpenChange = (open: boolean) => {
    if (open) {
      setPaymentDialogOpen(true);
      return;
    }
    resetPaymentState();
  };

  const startPayment = (method: "Cash" | "Card") => {
    setPaymentMethodPending(method);
    setTenderedAmount(total.toFixed(2));
    setPaymentError("");
    setCalculatedChange(0);
    setPaymentDialogOpen(true);
  };

  const handleTenderedInputChange = (value: string) => {
    setTenderedAmount(value);
    if (paymentError) {
      setPaymentError("");
    }
  };

  const confirmPayment = async () => {
    if (!paymentMethodPending) {
      return;
    }

    const amountNumber = parseFloat(tenderedAmount);
    if (Number.isNaN(amountNumber)) {
      setPaymentError("Enter a valid amount received.");
      return;
    }

    if (amountNumber < total) {
      setPaymentError("Received amount cannot be less than the payable total.");
      return;
    }

    const change = Math.max(0, amountNumber - total);
    setPaymentError("");

    const success = await handlePayment(paymentMethodPending, amountNumber, change);
    if (success) {
      resetPaymentState();
    }
  };

  const handlePayment = async (
    method: "Cash" | "Card",
    amountPaid: number,
    changeAmount: number
  ) => {
    const cartSnapshot = cart.map((item) => ({ ...item }));

    return await withPaymentLoading(async () => {
      try {
        // Prepare items for API
        const saleItems = cartSnapshot.map((item) => {
          // Use productId if available, otherwise fallback to extracting from id
          // (for backward compatibility, though productId should always be set)
          const productId = item.productId || item.id.split('_')[0];
          if (!productId) {
            throw new Error(`Missing product ID for item: ${item.name}`);
          }
          return {
            productId,
            quantity: item.quantity,
            price: item.price,
          };
        });

        // Get branchId from localStorage (key: 'branch')
        let branchId = "";
        try {
          const branchStr = localStorage.getItem("branch");
          console.log(branchStr);
          if (branchStr) {
            branchId = branchStr || "";
          }
        } catch (e) {
          branchId = "";
        }

        // Prepare payload
        const payload: any = {
          items: saleItems,
          paymentMethod: method === "Cash" ? "CASH" : "CARD",
          branchId,
        };
        if (selectedCustomer) {
          payload.customerId = selectedCustomer;
        }

        // Check if online
        const isOnline = syncManager.canMakeRequest();
        
        let saleData: any;
        let transactionId: string;
        
        if (isOnline) {
          // Online: Call create sale API
          try {
            const saleResponse = await apiClient.post("/sale", payload);
            saleData = saleResponse.data.data;
            transactionId = saleData.sale_number || generateTransactionId();
          } catch (error: any) {
            // If API call fails, fall back to offline mode
            console.warn("API call failed, saving offline:", error);
            transactionId = generateTransactionId();
            saleData = {
              sale_number: transactionId,
              id: `offline_${transactionId}`,
              _pending: true,
              _offline: true
            };
            
            // Save sale to IndexedDB for later sync
            await offlineDB.saveSale({
              id: transactionId,
              products: saleItems,
              total: total,
              customer: selectedCustomer ? { id: selectedCustomer } : null,
              payment: {
                method: method === "Cash" ? "CASH" : "CARD",
                amountPaid,
                changeAmount
              },
              employeeId: localStorage.getItem("userId") || undefined,
              branchId: branchId || undefined,
              timestamp: Date.now(),
              synced: false
            });
            
            // Queue the API request for when online
            await offlineAPIClient.post("/sale", payload, {
              priority: 10 // High priority for sales
            });
          }
        } else {
          // Offline: Generate local sale ID and save to IndexedDB
          transactionId = generateTransactionId();
          saleData = {
            sale_number: transactionId,
            id: `offline_${transactionId}`,
            _pending: true,
            _offline: true
          };
          
          // Save sale to IndexedDB for later sync
          await offlineDB.saveSale({
            id: transactionId,
            products: saleItems,
            total: total,
            customer: selectedCustomer ? { id: selectedCustomer } : null,
            payment: {
              method: method === "Cash" ? "CASH" : "CARD",
              amountPaid,
              changeAmount
            },
            employeeId: localStorage.getItem("userId") || undefined,
            branchId: branchId || undefined,
            timestamp: Date.now(),
            synced: false
          });
          
          // Also queue the API request for when online
          await offlineAPIClient.post("/sale", payload, {
            priority: 10 // High priority for sales
          });
          
          console.log("💾 Sale saved offline, will sync when connection restored");
        }
        const receiptData = generateReceiptData(
          transactionId,
          method,
          cartSnapshot,
          subtotal,
          total,
          amountPaid,
          changeAmount,
          discountAmount > 0 ? discountAmount : undefined
        );

        // Save transaction to local storage (simulate database)
        const transactions = JSON.parse(
          localStorage.getItem("transactions") || "[]"
        );
        transactions.push(receiptData);
        localStorage.setItem("transactions", JSON.stringify(transactions));

        setLastTransactionId(transactionId);
        setCart([]);
        // Clear discount after sale
        setGlobalDiscount(0);
        setGlobalDiscountType('percentage');
        setDiscountInput("");

        // Auto-print receipt
        try {
          // Get branch name from localStorage (correct source)
          const storedBranchName = localStorage.getItem("branchName");
          
          console.log("🏢 Current Branch:", storedBranchName);
          
          // Only show branch name and Karachi
          const fullAddress = `${storedBranchName}, Karachi`
         
          console.log("fullAddress", fullAddress);
          const receiptDataForServer: ReceiptData = {
            storeName: storedBranchName || branchName.name || "MANPASAND GENERAL STORE",
            tagline: "Quality • Service • Value",
            address: fullAddress,
            transactionId: transactionId,
            timestamp: new Date().toISOString(),
            cashier: receiptData.cashier || "Walk-in",
            customerType: selectedCustomer
              ? customers.find((c) => c.id === selectedCustomer)?.name ||
                "Walk-in"
              : "Walk-in",
            items: cartSnapshot.map((item) => {
              const unitLabel =
                (item as any)?.unit?.name ||
                (item as any)?.unitName ||
                (item as any)?.unit_name ||
                (item as any)?.unit ||
                undefined;
              return {
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                unit: unitLabel,
              };
            }),
            subtotal: subtotal,
            discount: discountAmount > 0 ? discountAmount : undefined,
            total: total,
            paymentMethod: method === "Cash" ? "CASH" : "CARD",
            amountPaid,
            changeAmount: changeAmount > 0 ? changeAmount : undefined,
            thankYouMessage: "Thank you for shopping!",
            footerMessage: "Visit us again soon!",
          };

          // Get printer object from saved state or localStorage
          let printerToUse: Printer | null = savedPrinterObj;
          
          // If not in state, try to load from localStorage
          if (!printerToUse) {
            const savedPrinterStr = localStorage.getItem('savedPrinter');
            if (savedPrinterStr) {
              try {
                printerToUse = JSON.parse(savedPrinterStr);
              } catch (e) {
                console.error("Failed to parse saved printer:", e);
              }
            }
          }

          // Fallback: use default printer from printers list
          if (!printerToUse && printers.length > 0) {
            printerToUse = printers.find((p) => p.isDefault) || printers[0];
          }

          // If still no printer, show error
          if (!printerToUse) {
            throw new Error("No printer selected. Please select a printer in settings.");
          }

          // Send full printer object from localStorage to API
          // Use the complete printer object saved in localStorage with all its properties
          // This ensures all printer details (name, receiptProfile, languageHint, status, etc.) are sent to API
          const printerObj = {
            // Spread all properties from saved printer object (name, receiptProfile, languageHint, status, etc.)
            ...printerToUse,
            // Include columns for backward compatibility (in case receiptProfile.columns doesn't exist)
            columns: printerToUse.receiptProfile?.columns || { fontA: 48, fontB: 64 },
          };

          const job = {
            copies: 1,
            cut: true,
            openDrawer: false,
          };

          // Print via print server
          // Use same API format as backend: printer, receiptData, job
          await printReceiptViaServer(
            printerObj,
            receiptDataForServer,
            job
          );
        } catch (printError) {
          console.error("Print error:", printError);
          // Print failed - no toast shown
        }

        return true;
      } catch (error) {
        console.error("Payment error:", error);
        // Payment failed - no toast shown
        return false;
      }
    });
  };

  // Create optimized lookup maps for O(1) product access
  // Build comprehensive barcode map indexing by barcode, code, and SKU
  // This ensures products can be found by any identifier
  const barcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    const exactMatches = new Map<string, Product>(); // Track exact matches separately
    
    products.forEach(product => {
      // Index by barcode (if exists)
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase().trim();
        if (barcodeLower) {
          exactMatches.set(barcodeLower, product);
          map.set(barcodeLower, product);
        }
      }
      
      // Index by code (if exists) - this is critical for CODE-PRICE format scanning
      if (product.code) {
        const codeLower = product.code.toLowerCase().trim();
        if (codeLower) {
          exactMatches.set(codeLower, product);
          map.set(codeLower, product);
        }
      }
      
      // Index by SKU (if exists)
      if (product.sku) {
        const skuLower = product.sku.toLowerCase().trim();
        if (skuLower) {
          exactMatches.set(skuLower, product);
          map.set(skuLower, product);
        }
      }
    });
    
    // Store exact matches map for priority lookup
    (map as any).exactMatches = exactMatches;
    
    return map;
  }, [products]);

  const findProductByBarcode = (barcode: string): Product | null => {
    if (!barcode) return null;
    
    const searchKey = barcode.toLowerCase().trim();
    if (!searchKey) return null;
    
    const exactMatches = (barcodeMap as any).exactMatches as Map<string, Product>;
    
    // CRITICAL: Try exact match FIRST - this prevents wrong product matches
    // Exact match has highest priority to avoid prefix matching issues
    if (exactMatches) {
      const exactMatch = exactMatches.get(searchKey);
      if (exactMatch) {
        console.log('Exact match found:', searchKey, '->', exactMatch.name);
        return exactMatch;
      }
    }
    
    // Try exact match from main map
    const exactMatch = barcodeMap.get(searchKey);
    if (exactMatch) {
      console.log('Exact match found (main map):', searchKey, '->', exactMatch.name);
      return exactMatch;
    }
    
    // Only if no exact match, try linear search for startsWith matches
    // This ensures we find the most specific match first
    let bestMatch: Product | null = null;
    let bestMatchLength = 0;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      // Check barcode field
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase().trim();
        if (barcodeLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (barcodeLower.startsWith(searchKey) && barcodeLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = barcodeLower.length;
        }
      }
      
      // Check code field
      if (product.code) {
        const codeLower = product.code.toLowerCase().trim();
        if (codeLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (codeLower.startsWith(searchKey) && codeLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = codeLower.length;
        }
      }
      
      // Check SKU field
      if (product.sku) {
        const skuLower = product.sku.toLowerCase().trim();
        if (skuLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (skuLower.startsWith(searchKey) && skuLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = skuLower.length;
        }
      }
    }
    
    if (bestMatch) {
      console.log('Best match found:', searchKey, '->', bestMatch.name);
      return bestMatch;
    }
    
    console.warn('No product found for barcode:', searchKey);
    return null;
  };

  const handleBarcodeScan = async () => {
    setScanLoading(true);
    try {
      // Simulate barcode scanning
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate finding a product by barcode
      const randomProduct =
        products[Math.floor(Math.random() * products.length)];
      await addToCart(randomProduct);
    } catch (error) {
      // Scan failed - no toast shown
    } finally {
      setScanLoading(false);
    }
  };

  const handleScannerInput = (scannedValue: string) => {
    // Prevent duplicate processing of the same scan
    const trimmedValue = scannedValue.trim();
    
    // Skip if already processing or if this is the same value we just processed
    if (isProcessingScanRef.current || lastProcessedScanRef.current === trimmedValue) {
      return;
    }
    
    // Mark as processing and store the value
    isProcessingScanRef.current = true;
    lastProcessedScanRef.current = trimmedValue;
    
    // Process immediately - zero delays, zero async operations
    
    // Ultra-fast parsing - single pass extraction
    const dashIndex = trimmedValue.indexOf('-');
    let productCode: string;
    let customPrice: number | undefined = undefined;
    
    if (dashIndex > 0) {
      // Extract code and price in one operation
      productCode = trimmedValue.substring(0, dashIndex).trim();
      const priceStr = trimmedValue.substring(dashIndex + 1).trim();
      // Parse price - handle both integer and decimal values
      // Remove any non-numeric characters except decimal point
      const cleanPriceStr = priceStr.replace(/[^\d.]/g, '');
      const parsedPrice = parseFloat(cleanPriceStr);
      if (!isNaN(parsedPrice) && parsedPrice >= 0 && isFinite(parsedPrice)) {
        customPrice = parsedPrice;
        console.log('Barcode scan - Code:', productCode, 'Raw price string:', priceStr, 'Parsed price:', customPrice);
      } else {
        console.error('Failed to parse price from:', priceStr, 'Cleaned:', cleanPriceStr, 'Parsed:', parsedPrice);
      }
    } else {
      productCode = trimmedValue.trim();
    }

    // Product lookup - use exact code first, then fallback to best match
    const codeLower = productCode.toLowerCase().trim();
    let product: Product | null = null;
    
    // CRITICAL: Try multiple matching strategies to find the correct product
    // 1. First try exact match on the full code (highest priority)
    product = findProductByBarcode(codeLower);
    console.log('Step 1 - Exact code match:', codeLower, 'Found:', product?.name || 'NOT FOUND');
    
    // 2. If not found and we have a price, try matching by price number in product name
    // This handles cases like "ROA432910-180" where "180" is in product name "Roasted Cashew Nuts (180)"
    if (!product && customPrice !== undefined) {
      const priceNumber = Math.round(customPrice).toString();
      // Look for products where name contains the price number in parentheses or as suffix
      const priceMatch = products.find(p => {
        const nameLower = p.name.toLowerCase();
        // Match patterns like "(180)", " 180", or ending with "180"
        return nameLower.includes(`(${priceNumber})`) || 
               nameLower.includes(` ${priceNumber} `) || 
               nameLower.endsWith(` ${priceNumber}`) ||
               nameLower.match(new RegExp(`[^0-9]${priceNumber}[^0-9]`));
      });
      if (priceMatch) {
        product = priceMatch;
        console.log('Step 2 - Price number match:', priceNumber, 'Found:', product.name);
      }
    }
    
    // 3. If not found and code contains numbers, try matching by extracting numeric part
    if (!product && /\d/.test(codeLower)) {
      const numericMatch = codeLower.match(/\d+/);
      if (numericMatch) {
        const numericPart = numericMatch[0];
        product = findProductByBarcode(numericPart);
        console.log('Step 3 - Numeric part match:', numericPart, 'Found:', product?.name || 'NOT FOUND');
      }
    }
    
    // 4. If still not found, try matching product name contains the code
    if (!product) {
      const codeInName = products.find(p => {
        const nameLower = p.name.toLowerCase();
        return nameLower.includes(`(${codeLower})`) || 
               nameLower.includes(` ${codeLower} `) || 
               nameLower.endsWith(` ${codeLower}`);
      });
      if (codeInName) {
        product = codeInName;
        console.log('Step 4 - Name pattern match:', codeLower, 'Found:', product.name);
      }
    }
    
    console.log('FINAL RESULT - Code:', codeLower, 'Price:', customPrice, 'Found Product:', product?.name || 'NOT FOUND', 'ID:', product?.id);
    
    if (!product) {
      console.error('❌ Product not found for scanned code:', productCode, 'Price:', customPrice);
      // Reset processing flag to allow next scan
      isProcessingScanRef.current = false;
      lastProcessedScanRef.current = '';
      return; // Exit early - don't add to cart
    }
    // Add to cart immediately if found (synchronous, no delays)
    if (product) {
      console.log('✅ SUCCESS - Adding to cart:', {
        scannedCode: productCode,
        scannedPrice: customPrice,
        matchedProduct: product.name,
        productId: product.id,
        productCode: product.code,
        productSKU: product.sku,
        productBarcode: product.barcode,
        productPrice: product.price
      });
      addToCart(product, 1, customPrice);
    } else {
      console.error('Product not found for code:', productCode);
    }
    
    // Clear input instantly via direct DOM manipulation (fastest method)
    const input = searchInputRef.current;
    if (input) {
      input.value = '';
      // Reset interaction flag and refocus search input after processing scan
      isUserInteractingRef.current = false;
      setTimeout(() => {
        if (input && !paymentDialogOpen) {
          input.focus();
          input.select();
        }
      }, 10);
      // Use startTransition for non-urgent state update
      startTransition(() => {
        setSearchTerm("");
      });
    } else {
      setSearchTerm("");
    }
    
    // Brief loading indicator (50ms - just enough for visual feedback)
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      // Reset processing flag after a short delay to allow next scan
      setTimeout(() => {
        isProcessingScanRef.current = false;
        lastProcessedScanRef.current = '';
      }, 100);
    }, 50);
  };

  const handleProductClick = (product: Product) => {
    addToCart(product, 1);
  };

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    // No need to set loading state as we're using cached data
  };

  // Global keyboard shortcuts - DISABLED during scanning to prevent interference
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable all shortcuts when scanning is active
      if (isScanning) {
        return;
      }
      
      // Don't handle shortcuts when typing in inputs or dialogs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // If it's the search input, allow normal typing
        if (target === searchInputRef.current) {
          return;
        }
        // For other inputs, only handle special shortcuts
        // 'C' for Cash, 'D' for Card when in payment dialog
        if (paymentDialogOpen) {
          if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Cash");
            }
            return;
          }
          if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Card");
            }
            return;
          }
        }
        return;
      }

      // Global shortcuts (when not in input)
      // Ctrl+Enter for Cash payment
      if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // Shift+Enter for Card payment
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // 'C' for Cash payment
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // 'D' for Card payment
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // Any alphabet key (a-z, A-Z) focuses search input - DISABLED to prevent interference with scanning
      // Commented out to prevent focus issues during scanning
      /*
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
      */
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, total, paymentDialogOpen, paymentMethodPending, startPayment, isScanning]);

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Products Section */}
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">New Sales</h1>
              {lastTransactionId && (
                <p className="text-sm text-green-600">
                  Last transaction: {lastTransactionId}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cart.length > 0 && (
                <Button variant="outline" onClick={holdCurrentSale}>
                  Hold Sale
                </Button>
              )}
              {holdSales.length > 0 && (
                <div className="flex items-center">
                  <Badge
                    variant="secondary"
                    className="mr-2 bg-blue-100 text-blue-800"
                  >
                    {holdSales.length} held
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Scroll the held sales list into view
                      const element = document.getElementById('held-sales-list');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  >
                    View Held Sales
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${isScanning ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} />
              {isScanning && (
                <LoadingSpinner size="sm" className="absolute right-3 top-1/2 transform -translate-y-1/2" />
              )}
              <Input
                ref={searchInputRef}
                placeholder={isScanning ? "Processing scan..." : "Scan barcode or search products..."}
                value={searchTerm}
                onBlur={(e) => {
                  // Don't blur if clicking on interactive elements
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (relatedTarget && (
                    relatedTarget.getAttribute('data-price-input') === 'true' ||
                    relatedTarget.getAttribute('data-quantity-input') === 'true' ||
                    relatedTarget.getAttribute('data-discount-input') === 'true' ||
                    relatedTarget.getAttribute('data-discount-select') === 'true' ||
                    relatedTarget.tagName === 'SELECT' ||
                    relatedTarget.closest('select')
                  )) {
                    return;
                  }
                  // Schedule refocus after idle period (not immediate)
                  // This allows user to interact with other elements
                }}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  
                  // Clear any pending scan timeout
                  if (scanTimeoutRef.current) {
                    clearTimeout(scanTimeoutRef.current);
                    scanTimeoutRef.current = null;
                  }
                  
                  // Auto-detect barcode scan format (CODE-PRICE) even without Enter
                  // This handles scanners that send data quickly
                  // Only process if the price part looks complete (at least 3 digits to avoid premature processing)
                  if (value.includes('-') && value.length > 6) {
                    // Check if it looks like CODE-PRICE format
                    const parts = value.split('-');
                    if (parts.length >= 2) {
                      const codePart = parts[0].trim();
                      const pricePart = parts.slice(1).join('-').trim();
                      // If code part exists and price part is numeric with at least 3 digits, treat as barcode scan
                      // This prevents processing when user is still typing (e.g., "CODE-8" vs "CODE-8000")
                      if (codePart.length > 0 && /^\d{3,}(\.\d+)?$/.test(pricePart)) {
                        // Skip if Enter key was just pressed (onKeyDown will handle it)
                        if (enterKeyPressedRef.current) {
                          enterKeyPressedRef.current = false;
                          return;
                        }
                        // Small delay to ensure scanner finished sending all data
                        if (scanTimeoutRef.current) {
                          clearTimeout(scanTimeoutRef.current);
                        }
                        scanTimeoutRef.current = setTimeout(() => {
                          const currentValue = searchInputRef.current?.value || '';
                          if (currentValue === value && value.includes('-')) {
                            // Double-check we have a complete price value
                            const finalParts = currentValue.split('-');
                            if (finalParts.length >= 2 && finalParts[1].trim().length > 0) {
                              handleScannerInput(currentValue);
                            }
                          }
                          scanTimeoutRef.current = null;
                        }, 300); // Wait 300ms to ensure scanner finished sending all digits (8000, not just 8)
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
                  // Detect Enter key (barcode scanner typically sends Enter after data)
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    e.preventDefault();
                    const trimmedValue = searchTerm.trim();
                    
                    // Mark that Enter was pressed to prevent onChange from processing
                    enterKeyPressedRef.current = true;
                    
                    // Check if it's a barcode format (numeric barcode or CODE-PRICE format)
                    const isNumericBarcode = /^\d{8,}$/.test(trimmedValue) ||
                      /^\d{12,13}$/.test(trimmedValue) || // EAN-13, UPC-A
                      /^\d{8}$/.test(trimmedValue); // EAN-8
                    
                    // Check if it's CODE-PRICE format (contains dash)
                    const isCodePriceFormat = trimmedValue.includes('-') && trimmedValue.length > 3;
                    
                    if (isNumericBarcode || isCodePriceFormat) {
                      handleScannerInput(trimmedValue);
                    }
                    
                    // Reset flag after processing
                    setTimeout(() => {
                      enterKeyPressedRef.current = false;
                    }, 100);
                  }
                }}
                className={`pl-10 ${isScanning ? 'border-blue-500 bg-blue-50/50' : ''}`}
                autoFocus
              />
            </div>
          </div>
        </div>

          <div className="mb-4">
            <div className="rounded-2xl border border-dashed border-blue-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setShowPrinterSettings((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-blue-50/40"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">Printer Settings</p>
                  <p className="text-xs text-gray-500">
                    Choose the receipt printer before completing a sale.
                  </p>
                </div>
                <div className="rounded-full bg-blue-100 p-1 text-blue-600">
                  {showPrinterSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {showPrinterSettings && (
                <div className="space-y-3 border-t border-blue-100 px-4 py-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Select printer
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedPrinter}
                    onChange={(e) => {
                      const printerName = e.target.value;
                      setSelectedPrinter(printerName);
                      // Find and save the full printer object
                      const selectedPrinterObj = printers.find((p) => p.name === printerName);
                      if (selectedPrinterObj) {
                        setSavedPrinterObj(selectedPrinterObj);
                      }
                    }}
                  >
                    <option value="">Choose a printer</option>
                    {printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name} {printer.isDefault ? "(Default)" : ""}
                      </option>
                    ))}
                  </select>
                  {printers.length === 0 && (
                    <p className="text-xs text-gray-500">Loading available printers...</p>
                  )}
                  <p className="text-xs text-gray-500">
                    A printer must be selected to enable payments and automatic receipt printing.
                  </p>
                </div>
              )}
            </div>
          </div>

        {/* Categories */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              onClick={() => handleCategoryChange(category.id)}
              className="whitespace-nowrap"
              disabled={productsLoading}
            >
              {productsLoading && selectedCategory === category.id && (
                <LoadingSpinner size="sm" className="mr-2" />
              )}
              {category.name}
            </Button>
          ))}
        </div>

        <div className="mb-4 max-w-xs bg-white text-black">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer (optional)
          </label>
          <select
            className="w-full border rounded px-3 py-2"
            style={{ color: "black", backgroundColor: "white" }}
            value={selectedCustomer ?? ""}
            onChange={(e) => setSelectedCustomer(e.target.value || null)}
          >
            <option value="">Select customer</option>
            {customers.map((customer: any) => (
              <option
                className="text-black"
                key={customer.id}
                value={customer.id}
              >
                <span className="text-black">{customer.email}</span>
                asdasdas
              </option>
            ))}
          </select>
        </div>

        {/* Products Grid */}
        {productsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="aspect-square bg-gray-200 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 col-span-full">
            <span className="text-2xl mb-2">🛒</span>
            <p className="text-gray-500 text-lg">
              No products found in this category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => {
              // Find cart items by productId (for separate entries) or id (backward compatibility)
              const cartItems = cart.filter((item) => 
                (item as any).productId === product.id || item.id === product.id
              );
              const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-2 space-y-1">
                    <h3 className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-bold text-blue-600">
                        Rs {product.price.toLocaleString()}
                      </span>
                      {totalQuantity > 0 && (
                        <Badge className="bg-blue-600 text-[10px] px-1.5 py-0.5">
                          {totalQuantity.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-[400px] bg-white lg:border-l border-gray-200 flex flex-col">
        <div className="border-b border-gray-200 bg-slate-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Sale Summary</h2>
              {cart.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Scan a product or search to start a new sale.
                </p>
              )}
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </div>
          </div>

          {cart.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Items</p>
                <p className="text-sm font-semibold text-gray-900">{cart.length}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Quantity</p>
                <p className="text-sm font-semibold text-gray-900">{totalQuantity.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Total</p>
                <p className="text-sm font-semibold text-gray-900">Rs {total.toFixed(2)}</p>
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearCart}
                className="flex-1 min-w-[120px] border-dashed"
              >
                Clear Cart
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={holdCurrentSale}
                className="flex-1 min-w-[120px]"
              >
                Hold Sale
              </Button>
            </div>
          )}

          {holdSales.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHeldSales((prev) => !prev)}
              className="mt-3 w-full justify-between border border-gray-200 bg-white hover:bg-white"
            >
              <span className="text-sm font-medium text-gray-700">
                Held Sales ({holdSales.length})
              </span>
              {showHeldSales ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}

          {holdSales.length > 0 && showHeldSales && (
            <div id="held-sales-list" className="mt-2 rounded-lg border border-dashed border-blue-200 bg-white p-3">
              <ScrollArea className="max-h-32">
                <div className="space-y-2 pr-2">
                  {holdSales.map((sale, index) => {
                    const saleTotal = sale.reduce(
                      (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
                      0
                    );
                    return (
                      <Button
                        key={index}
                        variant="outline"
                        onClick={() => handleRetrieveHoldSale(index)}
                        className="h-auto w-full justify-between border-gray-200 py-2"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-gray-900">Sale #{index + 1}</span>
                          <span className="text-xs text-gray-500">
                            {sale.length} items • Rs {saleTotal.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-blue-600">Resume</span>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

        </div>

        <div className="flex-1 overflow-hidden">
          <div ref={cartScrollContainerRef} className="h-full overflow-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="mt-8 text-center text-gray-500">
                <p className="font-medium text-gray-600">Your cart is empty</p>
                <p className="text-sm text-gray-500">Add products to see them here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    ref={(el) => {
                      cartItemRefs.current[item.id] = el;
                    }}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-gray-900 leading-snug">{item.name}</h4>
                        <p className="text-xs text-gray-500">
                          Original: Rs {item.originalPrice.toLocaleString()} • Line Total: <span className="font-semibold text-blue-600">Rs {((item.actualUnitPrice || item.price) * item.quantity).toLocaleString()}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.id)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {/* Unit Price - Can be changed to sell at custom price */}
                      <div>
                        <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Unit Price
                        </label>
                          <Input
                            ref={(el) => {
                              priceInputRefs.current[item.id] = el;
                              if (el) {
                                el.setAttribute('data-price-input', 'true');
                              }
                            }}
                            type="text"
                            inputMode="decimal"
                            value={priceInputs[item.id] !== undefined ? priceInputs[item.id] : (item.actualUnitPrice === 0 ? "" : String(item.actualUnitPrice || item.price))}
                            onFocus={() => {
                              isUserInteractingRef.current = true;
                            }}
                          onKeyDown={(e) => {
                            // Enter or Tab: Move to quantity input
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              const quantityInput = quantityInputRefs.current[item.id];
                              if (quantityInput) {
                                quantityInput.focus();
                                quantityInput.select();
                              }
                            }
                          }}
                          onChange={(e) => {
                            const value = e.target.value;
                            
                            // Update local input state
                            setPriceInputs(prev => ({ ...prev, [item.id]: value }));
                            
                            // Allow empty string - clear the value
                            if (value === "") {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, actualUnitPrice: 0, price: 0 };
                                  }
                                  return cartItem;
                                })
                              );
                              return;
                            }
                            
                            // Allow decimal point and numbers - validate format
                            if (/^(\d*\.?\d*)$/.test(value)) {
                              // If it's just a decimal point, don't update cart yet
                              if (value === ".") {
                                return;
                              }
                              
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                // Update both actualUnitPrice and price
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, actualUnitPrice: numValue, price: numValue };
                                    }
                                    return cartItem;
                                  })
                                );
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            // Clear local input state
                            setPriceInputs(prev => {
                              const newState = { ...prev };
                              delete newState[item.id];
                              return newState;
                            });
                            
                            // If empty or just a decimal point, reset to original price
                            if (value === "" || value === "." || value === "0") {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, actualUnitPrice: cartItem.originalPrice, price: cartItem.originalPrice };
                                  }
                                  return cartItem;
                                })
                              );
                            } else {
                              // Ensure valid number on blur
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, actualUnitPrice: numValue, price: numValue };
                                    }
                                    return cartItem;
                                  })
                                );
                              } else {
                                // Invalid, reset to original
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, actualUnitPrice: cartItem.originalPrice, price: cartItem.originalPrice };
                                    }
                                    return cartItem;
                                  })
                                );
                              }
                            }
                            // Allow a moment before allowing refocus
                            setTimeout(() => {
                              isUserInteractingRef.current = false;
                            }, 300);
                          }}
                          className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      
                      {/* Quantity */}
                      <div>
                        <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Qty {item.unitName ? `(${item.unitName})` : ''}
                        </label>
                        <div className="mt-1 flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const currentItem = cart.find((cartItem) => cartItem.id === item.id);
                              if (currentItem && currentItem.quantity > 0.01) {
                                updateQuantity(item.id, -1);
                              }
                            }}
                            className="h-8 w-6 p-0"
                            disabled={item.quantity <= 0.01}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            ref={(el) => {
                              quantityInputRefs.current[item.id] = el;
                              if (el) {
                                el.setAttribute('data-quantity-input', 'true');
                              }
                            }}
                            type="text"
                            inputMode="decimal"
                            onFocus={() => {
                              isUserInteractingRef.current = true;
                            }}
                            placeholder="0"
                            value={quantityInputs[item.id] !== undefined 
                              ? quantityInputs[item.id] 
                              : (item.quantity === 0 || item.quantity === 0.01 
                                  ? "" 
                                  : item.quantity.toFixed(2))}
                            onKeyDown={(e) => {
                              // Enter: Move to payment (open payment dialog)
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (cart.length > 0 && total > 0) {
                                  startPayment("Cash");
                                }
                              }
                              // Tab: Move to total price input
                              if (e.key === "Tab" && !e.shiftKey) {
                                e.preventDefault();
                                const totalPriceInput = document.querySelector(`[data-total-price-input="${item.id}"]`) as HTMLInputElement;
                                if (totalPriceInput) {
                                  totalPriceInput.focus();
                                  totalPriceInput.select();
                                }
                              }
                            }}
                            onChange={(e) => {
                              const value = e.target.value;
                              
                              // Remove unit from value if present (e.g., "2.5 kg" -> "2.5", "250 g" -> "250")
                              const cleanValue = value.replace(/\s*(kg|g|pcs|ml|l|gram|grams|piece|pieces|pc)\s*$/i, '').trim();
                              
                              // Update local input state
                              setQuantityInputs(prev => ({ ...prev, [item.id]: cleanValue }));
                              
                              // Allow empty string - clear the value
                              if (cleanValue === "") {
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, quantity: 0 };
                                    }
                                    return cartItem;
                                  })
                                );
                                return;
                              }
                              
                              // Allow decimal point and numbers - validate format
                              if (/^(\d*\.?\d*)$/.test(cleanValue)) {
                                // If it's just a decimal point, don't update cart yet
                                if (cleanValue === ".") {
                                  return;
                                }
                                
                                const numValue = parseFloat(cleanValue);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  updateQuantityManual(item.id, numValue);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              // Clear local input state
                              setQuantityInputs(prev => {
                                const newState = { ...prev };
                                delete newState[item.id];
                                return newState;
                              });
                              
                              // If empty or just a decimal point, set to minimum
                              if (value === "" || value === "." || value === "0") {
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, quantity: 0.01 };
                                    }
                                    return cartItem;
                                  })
                                );
                              } else {
                                // Ensure valid number on blur
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue) && numValue > 0) {
                                  updateQuantityManual(item.id, numValue);
                                } else {
                                  // Invalid or <= 0, set to minimum
                                  setCart(
                                    cart.map((cartItem) => {
                                      if (cartItem.id === item.id) {
                                        return { ...cartItem, quantity: 0.01 };
                                      }
                                      return cartItem;
                                    })
                                  );
                                }
                              }
                              // Allow a moment before allowing refocus
                              setTimeout(() => {
                                isUserInteractingRef.current = false;
                              }, 300);
                            }}
                            className="h-8 w-12 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="h-8 w-6 p-0"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Total Price - Auto calculates quantity */}
                      <div>
                        <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Total (Rs)
                        </label>
                        <Input
                          data-total-price-input={item.id}
                          type="text"
                          inputMode="decimal"
                          placeholder={((item.actualUnitPrice || item.price) * item.quantity).toFixed(0)}
                          onFocus={() => {
                            isUserInteractingRef.current = true;
                          }}
                          onKeyDown={(e) => {
                            // Tab: Move to next item's unit price
                            if (e.key === "Tab" && !e.shiftKey) {
                              const currentIndex = cart.findIndex(cartItem => cartItem.id === item.id);
                              if (currentIndex < cart.length - 1) {
                                e.preventDefault();
                                const nextItem = cart[currentIndex + 1];
                                const nextPriceInput = priceInputRefs.current[nextItem.id];
                                if (nextPriceInput) {
                                  nextPriceInput.focus();
                                  nextPriceInput.select();
                                }
                              }
                            }
                            // Enter: Open payment
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (cart.length > 0 && total > 0) {
                                startPayment("Cash");
                              }
                            }
                          }}
                          onChange={(e) => {
                            const value = e.target.value;
                            
                            // Allow decimal point and numbers
                            if (/^(\d*\.?\d*)$/.test(value) && value !== ".") {
                              const totalPrice = parseFloat(value);
                              const unitPrice = item.actualUnitPrice || item.price || item.originalPrice;
                              
                              if (!isNaN(totalPrice) && totalPrice >= 0 && unitPrice > 0) {
                                // Calculate quantity from total price
                                const calculatedQuantity = totalPrice / unitPrice;
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, quantity: Math.max(0.01, calculatedQuantity) };
                                    }
                                    return cartItem;
                                  })
                                );
                              }
                            }
                          }}
                          onBlur={() => {
                            // Allow a moment before allowing refocus
                            setTimeout(() => {
                              isUserInteractingRef.current = false;
                            }, 300);
                          }}
                          className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white/95 px-3 py-3 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Discount
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <select
                      data-discount-select="true"
                      className="h-8 rounded border border-gray-200 px-2 text-xs"
                      value={globalDiscountType}
                      onFocus={() => {
                        isUserInteractingRef.current = true;
                      }}
                      onBlur={() => {
                        // Allow a moment for user to continue interacting
                        setTimeout(() => {
                          isUserInteractingRef.current = false;
                        }, 300);
                      }}
                      onChange={(e) => {
                        setGlobalDiscountType(
                          e.target.value as "percentage" | "amount"
                        );
                        // Clear discount input when switching types
                        setDiscountInput("");
                        setGlobalDiscount(0);
                      }}
                    >
                      <option value="percentage">%</option>
                      <option value="amount">Rs</option>
                    </select>
                    <Input
                      data-discount-input="true"
                      type="text"
                      inputMode="decimal"
                      value={discountInput}
                      onFocus={() => {
                        isUserInteractingRef.current = true;
                      }}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        
                        // If empty or just a decimal point, clear discount
                        if (value === "" || value === "." || value === "0") {
                          setDiscountInput("");
                          setGlobalDiscount(0);
                        } else {
                          // Ensure valid number on blur
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Validate max for percentage
                            if (globalDiscountType === "percentage" && numValue > 100) {
                              setDiscountInput("100");
                              setGlobalDiscount(100);
                            } else {
                              setDiscountInput(value);
                              setGlobalDiscount(numValue);
                            }
                          } else {
                            // Invalid, clear
                            setDiscountInput("");
                            setGlobalDiscount(0);
                          }
                        }
                        
                        // Allow a moment before allowing refocus
                        setTimeout(() => {
                          isUserInteractingRef.current = false;
                        }, 300);
                      }}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDiscountInput(value);
                        
                        // Allow empty string - clear the value
                        if (value === "") {
                          setGlobalDiscount(0);
                          return;
                        }
                        
                        // Allow decimal point and numbers - validate format
                        if (/^(\d*\.?\d*)$/.test(value)) {
                          // If it's just a decimal point, don't update discount yet
                          if (value === ".") {
                            return;
                          }
                          
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Validate max for percentage
                            if (globalDiscountType === "percentage" && numValue > 100) {
                              return;
                            }
                            setGlobalDiscount(numValue);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        
                        // If empty or just a decimal point, clear discount
                        if (value === "" || value === "." || value === "0") {
                          setDiscountInput("");
                          setGlobalDiscount(0);
                        } else {
                          // Ensure valid number on blur
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Validate max for percentage
                            if (globalDiscountType === "percentage" && numValue > 100) {
                              setDiscountInput("100");
                              setGlobalDiscount(100);
                            } else {
                              setDiscountInput(value);
                              setGlobalDiscount(numValue);
                            }
                          } else {
                            // Invalid, clear
                            setDiscountInput("");
                            setGlobalDiscount(0);
                          }
                        }
                        
                        // Allow a moment before allowing refocus
                        setTimeout(() => {
                          isUserInteractingRef.current = false;
                        }, 300);
                      }}
                      className="h-8 flex-1 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-gray-600 text-xs font-medium">
                    <span>Subtotal</span>
                    <span className="text-sm font-semibold text-blue-700">{subtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="mt-1 flex items-center justify-between text-green-600 text-xs font-medium">
                      <span>Discount</span>
                      <span>- {discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-blue-700 text-sm font-semibold">
                    <span>Payable</span>
                    <span>{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  onClick={() => startPayment("Cash")}
                  disabled={paymentLoading}
                  className="h-10 text-sm"
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startPayment("Card")}
                  disabled={paymentLoading}
                  className="h-10 text-sm"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Card
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={paymentDialogOpen}
        onOpenChange={handlePaymentDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paymentMethodPending ? `${paymentMethodPending} Payment` : "Payment"}
            </DialogTitle>
            <DialogDescription>
              Enter the amount received to calculate the change due.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Payable Amount</span>
                <span className="font-semibold text-gray-900">
                  Rs {total.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-green-600 font-semibold">
                <span>Change Due</span>
                <span>Rs {calculatedChange.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Amount Received
              </label>
              <Input
                type="number"
                autoFocus
                value={tenderedAmount}
                onChange={(e) => handleTenderedInputChange(e.target.value)}
                onKeyDown={(e) => {
                  // Enter: Confirm payment
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmPayment();
                  }
                  // Escape: Cancel payment
                  if (e.key === "Escape") {
                    e.preventDefault();
                    resetPaymentState();
                  }
                }}
                className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                min="0"
                step="0.01"
              />
            </div>
            {paymentError && (
              <p className="text-sm text-red-600">{paymentError}</p>
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={resetPaymentState}
              disabled={paymentLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPayment}
              disabled={paymentLoading || !paymentMethodPending}
            >
              {paymentLoading
                ? "Processing..."
                : `Confirm ${paymentMethodPending ?? "Payment"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}