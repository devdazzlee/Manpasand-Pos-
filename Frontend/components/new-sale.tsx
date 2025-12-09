"use client";

import { useState, useEffect, useRef } from "react";
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

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  categoryId: string;
  barcode?: string;
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
    };
  }, []); // Empty dependency array since we only want to fetch once on mount

  // Load all products once on mount and when category changes (no search term)
  useEffect(() => {
    const categoryFilter =
      selectedCategory !== "all" ? selectedCategory : undefined;

    // Only fetch from API when category changes and no search term
    // This ensures we have all products cached for client-side search
    if (!searchTerm) {
      const loadByCategory = async () => {
        try {
          await fetchProducts({
            force: false, // Use cache if available
            categoryId: categoryFilter,
          });
        } catch (error) {
          // Error loading products - no toast shown
        }
      };

      loadByCategory();
    }
  }, [selectedCategory]); // Only depend on category, not searchTerm

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

  const addToCart = async (product: Product, quantity: number = 1) => {
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

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      );
      lastAddedProductId.current = product.id;
      
      // Auto-scroll to existing item when quantity is updated
      setTimeout(() => {
        const cartItem = cartItemRefs.current[product.id];
        if (cartItem && cartScrollContainerRef.current) {
          cartItem.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 100);
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          originalPrice: product.price,
          quantity: quantity,
          category: product.category,
          discount: 0,
          unitId: product.unitId,
          unitName: product.unitName,
          unit: product.unitName,
        },
      ]);
      lastAddedProductId.current = product.id;
      
      // Auto-scroll to newly added item
      setTimeout(() => {
        const cartItem = cartItemRefs.current[product.id];
        if (cartItem && cartScrollContainerRef.current) {
          cartItem.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 150);
    }

    // Auto-focus on price input after adding product
    setTimeout(() => {
      const priceInput = priceInputRefs.current[product.id];
      if (priceInput) {
        priceInput.focus();
        priceInput.select();
      }
    }, 100);

    // Toast removed as per user request - no toast when selecting products
  };

  const updateQuantity = (id: string, change: number) => {
    const item = cart.find((item) => item.id === id);
    const product = products.find((p) => p.id === id);

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

    setCart(
      cart.map((item) => {
        if (item.id === id) {
          const newQuantity = Number(item.quantity) + Number(change);
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
    (sum, item) => sum + item.price * item.quantity,
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
        const saleItems = cartSnapshot.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        }));

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

  const findProductByBarcode = (barcode: string): Product | null => {
    return products.find(product => product.barcode === barcode) || null;
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

  const handleScannerInput = async (scannedValue: string) => {
    setIsScanning(true);

    try {
      // Clear the search term first
      setSearchTerm("");

      // Find product by barcode
      const product = findProductByBarcode(scannedValue);

      if (product) {
        // Add product to cart
        await addToCart(product, 1);
      }
      // Product not found - no toast shown
    } finally {
      setIsScanning(false);
    }
  };

  const handleProductClick = (product: Product) => {
    addToCart(product, 1);
  };

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    // No need to set loading state as we're using cached data
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

      // Any alphabet key (a-z, A-Z) focuses search input
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, total, paymentDialogOpen, paymentMethodPending, startPayment]);

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
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${isScanning ? 'text-blue-500' : 'text-gray-400'}`} />
              <Input
                ref={searchInputRef}
                placeholder={isScanning ? "Scanning..." : "Scan barcode or search products..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  // Detect Enter key (barcode scanner typically sends Enter after data)
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    e.preventDefault();
                    // Check if it looks like a barcode (numeric, 8+ digits or common barcode formats)
                    const isBarcode = /^\d{8,}$/.test(searchTerm.trim()) ||
                      /^\d{12,13}$/.test(searchTerm.trim()) || // EAN-13, UPC-A
                      /^\d{8}$/.test(searchTerm.trim()); // EAN-8
                    if (isBarcode) {
                      handleScannerInput(searchTerm.trim());
                    }
                  }
                }}
                className={`pl-10 ${isScanning ? 'border-blue-500 bg-blue-50' : ''}`}
                autoFocus
                disabled={isScanning}
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
              const cartItem = cart.find((item) => item.id === product.id);
              return (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-2 space-y-1">
                    <h3 className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 flex items-center justify-between gap-1">
                      <span className="flex-1">{product.name}</span>
                      <span className="shrink-0 text-[11px] font-medium text-gray-700">
                        {product.price.toFixed(2)}
                      </span>
                    </h3>
                    {cartItem && (
                      <Badge className="bg-blue-600 text-[10px] px-1.5 py-0.5">
                        {cartItem.quantity.toFixed(2)}
                      </Badge>
                    )}
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
                      (sum, item) => sum + item.price * item.quantity,
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
                          Unit: Rs {item.price.toFixed(2)} • Line Total: Rs {(item.price * item.quantity).toFixed(2)}
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

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Price (Rs)
                        </label>
                        <Input
                          ref={(el) => {
                            priceInputRefs.current[item.id] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          value={priceInputs[item.id] !== undefined ? priceInputs[item.id] : (item.price === 0 ? "" : String(item.price))}
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
                                    return { ...cartItem, price: 0 };
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
                                updateItemPrice(item.id, numValue);
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
                            
                            // If empty or just a decimal point, set to 0
                            if (value === "" || value === "." || value === "0") {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, price: 0 };
                                  }
                                  return cartItem;
                                })
                              );
                            } else {
                              // Ensure valid number on blur
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                updateItemPrice(item.id, numValue);
                              } else {
                                // Invalid, reset to 0
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, price: 0 };
                                    }
                                    return cartItem;
                                  })
                                );
                              }
                            }
                          }}
                          className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Quantity
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
                            className="h-8 w-8 p-0"
                            disabled={item.quantity <= 0.01}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            ref={(el) => {
                              quantityInputRefs.current[item.id] = el;
                            }}
                            type="text"
                            inputMode="decimal"
                            value={quantityInputs[item.id] !== undefined ? quantityInputs[item.id] : (item.quantity === 0 || item.quantity === 0.01 ? "" : String(item.quantity))}
                            onKeyDown={(e) => {
                              // Enter: Move to payment (open payment dialog)
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (cart.length > 0 && total > 0) {
                                  startPayment("Cash");
                                }
                              }
                              // Tab: Move to next item or payment
                              if (e.key === "Tab" && !e.shiftKey) {
                                const currentIndex = cart.findIndex(cartItem => cartItem.id === item.id);
                                if (currentIndex < cart.length - 1) {
                                  // Move to next item's price
                                  e.preventDefault();
                                  const nextItem = cart[currentIndex + 1];
                                  const nextPriceInput = priceInputRefs.current[nextItem.id];
                                  if (nextPriceInput) {
                                    nextPriceInput.focus();
                                    nextPriceInput.select();
                                  }
                                } else {
                                  // Last item, allow default tab behavior (might go to payment button)
                                }
                              }
                            }}
                            onChange={(e) => {
                              const value = e.target.value;
                              
                              // Update local input state
                              setQuantityInputs(prev => ({ ...prev, [item.id]: value }));
                              
                              // Allow empty string - clear the value
                              if (value === "") {
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
                              if (/^(\d*\.?\d*)$/.test(value)) {
                                // If it's just a decimal point, don't update cart yet
                                if (value === ".") {
                                  return;
                                }
                                
                                const numValue = parseFloat(value);
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
                            }}
                            className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="h-8 w-8 p-0"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, quantity: 0 };
                                  }
                                  return cartItem;
                                })
                              );
                            }}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                            title="Clear quantity"
                          >
                            ×
                          </Button>
                        </div>
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
                      className="h-8 rounded border border-gray-200 px-2 text-xs"
                      value={globalDiscountType}
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
                      type="text"
                      inputMode="decimal"
                      value={discountInput}
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