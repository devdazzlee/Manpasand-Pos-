"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLoading } from "@/hooks/use-loading";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Scan,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { usePosData } from "@/hooks/use-pos-data";
import { isKioskMode, enableKioskMode } from "@/utils/kiosk-printing";
import { printReceiptViaServer, getPrinters, type ReceiptData } from "@/lib/print-server";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  quantity: number;
  category: string;
  discount: number;
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
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [holdSaleDialogOpen, setHoldSaleDialogOpen] = useState(false);
  const [holdSales, setHoldSales] = useState<CartItem[][]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [taxValue, setTaxValue] = useState(5);
  const [taxType, setTaxType] = useState<'percentage' | 'amount'>('percentage');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(
    null
  );
  const { loading: paymentLoading, withLoading: withPaymentLoading } =
    useLoading();
  const [scanLoading, setScanLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [kioskMode, setKioskMode] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [showHeldSales, setShowHeldSales] = useState(false);

  // Detect kiosk mode on mount
  useEffect(() => {
    const kiosk = isKioskMode();
    setKioskMode(kiosk);
    if (kiosk) {
      setSelectedPrinter('Default Printer');
      setPrinters([{ name: 'Default Printer', isDefault: true, status: 'available' }]);
      enableKioskMode();
    }
  }, []);

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
    refreshAllData,
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
        if (mounted) {
          toast({
            variant: "destructive",
            title: "Failed to load data",
            description: "Could not fetch data from server",
          });
        }
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

  // Handle search updates
  useEffect(() => {
    // Don't trigger search if searchTerm is empty
    if (!searchTerm) {
      // Reset to initial products when search is cleared
      fetchProducts(true);
      return;
    }

    if (searchTerm.length < 2) return; // Don't search with less than 2 characters

    const handleSearch = async () => {
      try {
        await fetchProducts(true, searchTerm); // Force refresh with search term
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Search failed",
          description: "Could not fetch search results",
        });
      }
    };

    const debounceTimer = setTimeout(handleSearch, 300); // Debounce search
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]); // Remove fetchProducts and toast from dependencies

  const filteredProducts = products.filter((product) => {
    // Only filter by category since search is now handled by the API
    return (
      selectedCategory === "all" || product.categoryId === selectedCategory
    );
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
        },
      ]);
    }

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
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: Number(newQuantity) };
        }
        return item;
      })
    );
  };

  const updateItemPrice = (id: string, newPrice: number) => {
    if (newPrice < 0) return;
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, price: Number(newPrice) };
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
      toast({
        variant: "destructive",
        title: "Cannot Hold Empty Cart",
        description: "Add some items to the cart first",
      });
      return;
    }
    setHoldSales([...holdSales, [...cart]]);
    setCart([]);
    toast({
      title: "Sale Held",
      description: `Sale #${holdSales.length + 1} has been held`,
    });
  };

  const retrieveHoldSale = (index: number) => {
    if (cart.length > 0) {
      const shouldReplace = window.confirm(
        "Current cart will be replaced. Continue?"
      );
      if (!shouldReplace) return;
    }
    const heldSale = holdSales[index];
    setCart(heldSale);
    setHoldSales(holdSales.filter((_, i) => i !== index));
    toast({
      title: "Sale Retrieved",
      description: `Held sale #${index + 1} has been restored`,
    });
  };

  const getBranchName = async () => {
    try {
      const branchId = localStorage.getItem("branch");
      if (!branchId) throw new Error("No branch id in localStorage");

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

        // Auto-select default printer if available
        const defaultPrinter = printerList.find((p: Printer) => p.isDefault);
        if (defaultPrinter) {
          setSelectedPrinter(defaultPrinter.name);
        } else if (printerList.length > 0) {
          setSelectedPrinter(printerList[0].name);
        }
      } else {
        throw new Error(result.error || 'Failed to get printers');
      }
    } catch (err) {
      console.error("Failed to load printers:", err);
      toast({
        title: "Warning",
        description: "Failed to load available printers",
        variant: "destructive",
      });
    }
  };

  const removeFromCart = (id: string) => {
    const item = cart.find((item) => item.id === id);
    setCart(cart.filter((item) => item.id !== id));

    if (item) {
      toast({
        title: "Item Removed",
        description: `${item.name} removed from cart`,
      });
    }
  };

  const clearCart = () => {
    setCart([]);
    toast({
      title: "Cart Cleared",
      description: "All items removed from cart",
    });
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const discountAmount = globalDiscountType === 'percentage'
    ? (subtotal * globalDiscount) / 100
    : globalDiscount;

  const safeTaxValue = Number.isFinite(taxValue) ? taxValue : 0;
  const normalizedTaxValue = Math.max(0, safeTaxValue);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxType === 'percentage'
    ? (taxableAmount * normalizedTaxValue) / 100
    : normalizedTaxValue;
  const total = taxableAmount + taxAmount;
  const taxLabel =
    taxType === 'percentage'
      ? `Tax (${normalizedTaxValue % 1 === 0 ? normalizedTaxValue.toFixed(0) : normalizedTaxValue.toFixed(2)}%)`
      : 'Tax (Fixed)';
  const taxPercentForReceipt =
    taxType === 'percentage'
      ? normalizedTaxValue
      : taxableAmount > 0
      ? (taxAmount / taxableAmount) * 100
      : 0;
  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const generateTransactionId = () => {
    return `TXN${Date.now().toString().slice(-6)}`;
  };

  const generateReceiptData = (
    transactionId: string,
    paymentMethod: string,
    cart: CartItem[],
    subtotal: number,
    total: number
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
    };
  };

  const printReceipt = (receiptContent: string, useKioskMode: boolean = false) => {
    // ALWAYS check URL params first - this is the most reliable indicator
    const urlParams = new URLSearchParams(window.location.search);
    const urlKioskMode = urlParams.get('kiosk-printing') === 'true' || urlParams.get('kiosk') === 'true';
    
    // Re-check kiosk mode to ensure it's detected (especially on production)
    const isKioskDetected = isKioskMode();
    const isKiosk = urlKioskMode || useKioskMode || kioskMode || isKioskDetected;
    
    console.log('Print Receipt - Kiosk Mode Detection:', { 
      urlKioskMode,
      useKioskMode, 
      kioskMode, 
      isKioskDetected,
      finalDecision: isKiosk 
    });
    
    // CRITICAL: ALWAYS use iframe when URL has kiosk-printing=true
    // This is necessary because --kiosk-printing flag only works with iframe printing
    // window.open() does NOT respect --kiosk-printing flag and will show print dialog
    if (isKiosk) {
      console.log('✅ Using iframe printing (kiosk mode detected) - Print dialog will be suppressed');
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '-9999px';
      printFrame.style.width = '100mm';
      printFrame.style.height = 'auto';
      printFrame.style.minHeight = 'auto';
      printFrame.style.border = 'none';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);
      
      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(`
<html>
  <head>
    <title>Receipt</title>
    <!-- JsBarcode CDN for professional barcodes -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
   <style>
      /* Thermal printer optimized styles with larger fonts */
      html, body { 
        margin: 0; 
        padding: 0; 
        background: white;
        height: auto;
        min-height: auto;
      }
      
       body { 
          font-family: 'Courier New', monospace; 
          font-size: 12px;
          line-height: 1.2;
          color: #000000;
          font-weight: bold;
          display: block;
          padding: 0;
        }

    .receipt {
          width: 100mm;
          max-width: 500px;
          background: white;
          color: #000000;
          font-weight: bold;
          text-align: center;
          padding: 1mm 2mm;
          margin: 0;
          box-sizing: border-box;
          height: auto;
          min-height: auto;
        }

      /* Logo specific styles */
      .logo {
        text-align: center;
        margin-bottom: 12px; /* Increased from 8px */
      }
      
      .logo img {
        max-width: 180px; /* Increased from 160px */
        height: 50px; /* Increased from 40px */
        display: block;
        margin: 0 auto;
        object-fit: contain;
      }
      
      .store-header {
        font-weight: 900;
        font-size: 24px; /* Increased from 16px */
        margin-bottom: 6px; /* Increased from 4px */
        color: #000000;
      }
      
      .tagline, .address {
        font-size: 16px; /* Increased from 10px */
        margin-bottom: 4px; /* Increased from 2px */
        color: #000000;
        font-weight: bold;
      }
      
      .divider {
        margin: 6px 0; /* Increased from 4px */
        color: #000000;
        font-weight: bold;
        border: none;
        text-align: center;
        font-size: 16px; /* Added explicit size */
      }
      
      .receipt-info, .payment-info {
        text-align: left;
        font-size: 16px; /* Increased from 10px */
        margin: 4px 0; /* Increased from 2px */
        color: #000000;
        font-weight: bold;
      }
      
      .receipt-number, .payment-method {
        font-weight: 900;
        color: #000000;
      }
      
      .flex-item-row-cs{
        display: flex;
        justify-content: space-between;
        align-items: center;           
        width: 100%;
        box-sizing: border-box;
        white-space: nowrap; /* Prevent line breaks */
      }

      /* Improved items section with larger fonts */
      .items-section {
        margin: 8px 0; /* Increased from 6px */
        font-size: 16px; /* Increased from 10px */
        line-height: 1.4; /* Increased from 1.3 */
        font-family: 'Courier New', monospace;
        font-weight: bold;
      }

      .items-header {
        display: flex;
        justify-content: space-between;
        font-weight: 900;
        font-size: 18px; /* Increased - was not specified */
        margin-bottom: 6px; /* Increased from 4px */
        padding-bottom: 3px; /* Increased from 2px */
        border-bottom: 2px solid #000; /* Made thicker from 1px */
      }

      .items-header .item-col {
        flex: 2;
        text-align: left;
      }

      .items-header .qty-col {
        flex: 1;
        text-align: center;
        min-width: 70px; /* Increased from 60px */
      }

      .items-header .rate-col {
        flex: 1;
        text-align: right;
        min-width: 90px; /* Increased from 80px */
      }

      .item-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin: 4px 0; /* Increased from 3px */
        min-height: 20px; /* Increased from 16px */
        font-weight: bold;
        font-size: 16px; /* Added explicit size */
      }

      .item-name {
        flex: 2;
        text-align: left;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        line-height: 1.3; /* Increased from 1.2 */
        padding-right: 8px;
      }

      .item-qty {
        flex: 1;
        text-align: center;
        min-width: 70px; /* Increased from 60px */
        white-space: nowrap;
      }

      .item-rate {
        flex: 1;
        text-align: right;
        min-width: 90px; /* Increased from 80px */
        white-space: nowrap;
      }

      /* Special styling for sub-items */
      .item-sub-row {
        display: flex;
        margin: 2px 0 4px 0; /* Increased from 1px 0 3px 0 */
        font-style: italic;
        opacity: 0.8;
        font-size: 14px; /* Increased from 9px */
      }

      .item-sub-name {
        flex: 2;
        text-align: left;
        padding-left: 12px; /* Increased from 10px */
        padding-right: 8px;
      }

      .item-sub-qty {
        flex: 1;
        text-align: center;
        min-width: 70px; /* Increased from 60px */
      }

      .item-sub-rate {
        flex: 1;
        text-align: right;
        min-width: 90px; /* Increased from 80px */
      }
      
      .totals {
        text-align: right;
        font-size: 16px; /* Increased from 10px */
        margin: 4px 0; /* Increased from 2px */
        color: #000000;
        font-weight: bold;
      }
      
      .subtotal-section {
        border-top: 2px solid black; /* Made thicker from 1px */
        padding-top: 6px; /* Increased from 4px */
        margin-top: 8px; /* Increased from 6px */
        font-weight: bold;
      }
      
      .grand-total {
        font-weight: 900;
        font-size: 18px; /* Increased from 12px */
        color: #000000;
        margin: 6px 0; /* Increased from 4px */
        border-top: 2px solid black; /* Made thicker from 1px */
        border-bottom: 2px solid black; /* Made thicker from 1px */
        padding: 4px 0; /* Increased from 2px */
      }
      
      .promo {
        padding: 6px; /* Increased from 4px */
        margin: 8px 0; /* Increased from 6px */
        font-size: 14px; /* Increased from 9px */
        color: #000000;
        font-weight: bold;
        text-align: left;
      }
      
      /* Professional barcode styling */
      .barcode-section {
        text-align: center;
        margin: 10px 0; /* Increased spacing */
      }
      
      .barcode {
        margin: 8px 0; /* Increased from 6px */
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .barcode svg {
        max-width: 100%;
        height: 50px; /* Professional barcode height */
      }
      
      .barcode-number {
        font-size: 14px; /* Increased from 10px */
        color: #000000;
        margin-top: 6px; /* Increased from 4px */
        font-weight: bold;
        letter-spacing: 2px; /* Added for better readability */
      }
      
      .thank-you {
        font-size: 17px; /* Increased from 11px */
        margin-top: 10px; /* Increased from 8px */
        font-weight: 900;
        color: #000000;
        padding-top: 6px; /* Increased from 4px */
      }

      /* Print optimization */
      @media print {
        @page {
          size: 100mm auto;
          margin: 0;
          padding: 0;
        }
      
        html, body {
          width: 100mm !important;
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: #000000 !important;
          overflow: visible !important;
        }
        
        .receipt {
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 2mm !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
        
        /* Logo print styles */
        .logo img {
          max-width: 140px !important;
          height: 50px !important;
          display: block !important;
          margin: 0 auto !important;
          object-fit: contain !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        
        /* Force black text for printing but preserve images */
        * {
          color: #000000 !important;
          font-weight: bold !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Barcode print optimization */
        .barcode svg {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Specific exclusion for images */
        img, svg {
          background: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt">${receiptContent}</div>
    <script>
      // Generate professional barcode after content loads
      window.onload = function() {
        const barcodeElement = document.getElementById('barcode-svg');
        const barcodeNumber = document.getElementById('barcode-number').textContent;
        
        if (barcodeElement && barcodeNumber && window.JsBarcode) {
          try {
            JsBarcode(barcodeElement, barcodeNumber, {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: false,
              margin: 0,
              background: "#ffffff",
              lineColor: "#000000"
            });
          } catch (error) {
            console.error('Barcode generation failed:', error);
            // Fallback to text-based barcode
            barcodeElement.innerHTML = '<div style="font-family: monospace; font-size: 18px;">||||| |||| ||||| ||||</div>';
          }
        }
        
        // Wait for all images and content to load before calculating height
        function calculateAndPrint() {
          // Wait for images to load
          const images = document.querySelectorAll('img');
          let imagesLoaded = 0;
          const totalImages = images.length;
          
          if (totalImages === 0) {
            // No images, proceed immediately
            proceedWithPrint();
          } else {
            images.forEach(img => {
              if (img.complete) {
                imagesLoaded++;
                if (imagesLoaded === totalImages) {
                  proceedWithPrint();
                }
              } else {
                img.onload = () => {
                  imagesLoaded++;
                  if (imagesLoaded === totalImages) {
                    proceedWithPrint();
                  }
                };
                img.onerror = () => {
                  imagesLoaded++;
                  if (imagesLoaded === totalImages) {
                    proceedWithPrint();
                  }
                };
              }
            });
          }
        }
        
        function proceedWithPrint() {
          // Small delay to ensure everything is rendered
          setTimeout(() => {
            const receipt = document.querySelector('.receipt');
            const body = document.body;
            
            if (receipt && body) {
              // Get actual scroll height after all content is loaded
              const receiptHeight = Math.max(receipt.scrollHeight, receipt.offsetHeight, body.scrollHeight);
              const receiptHeightMM = Math.ceil(receiptHeight * 0.264583); // Convert px to mm
              
              // Update @page size dynamically using inline style - Set immediately to prevent paper waste
              const style = document.createElement('style');
              style.id = 'dynamic-page-size';
              const existingStyle = document.getElementById('dynamic-page-size');
              if (existingStyle) {
                existingStyle.remove();
              }
              // Set page size exactly to content height - NO TOP MARGIN, minimal padding
              // Force page size aggressively to override printer driver settings
              style.textContent = '@page { size: 100mm ' + receiptHeightMM + 'mm !important; margin: 0 !important; } @media print { @page { size: 100mm ' + receiptHeightMM + 'mm !important; margin: 0 !important; padding: 0 !important; } html, body { width: 100mm !important; height: ' + receiptHeightMM + 'mm !important; min-height: ' + receiptHeightMM + 'mm !important; max-height: ' + receiptHeightMM + 'mm !important; margin: 0 !important; padding: 0 !important; } .receipt { margin: 0 !important; padding: 1mm 2mm !important; } body > * { margin-top: 0 !important; padding-top: 0 !important; } .receipt > *:first-child { margin-top: 0 !important; padding-top: 0 !important; } }';
              document.head.appendChild(style);
              
              // Also try to set print media properties via JavaScript
              try {
                const mediaQuery = window.matchMedia('print');
                if (mediaQuery && mediaQuery.matches) {
                  // Force apply styles during print
                }
              } catch (e) {
                // Ignore if not supported
              }
              
              // Resize window to fit content height (only for window.open, not iframe)
              if (window.opener === null && window.parent === window) {
                const padding = 20;
                window.resizeTo(400, Math.min(receiptHeight + padding, screen.height));
              }
              
              // Wait longer for styles to apply before printing
              setTimeout(() => {
                window.focus();
                // Try to print with explicit page size
                const printWindow = window as any;
                if (printWindow.document && printWindow.document.body) {
                  printWindow.document.body.style.height = receiptHeightMM + 'mm';
                }
                window.print();
              }, 200); // Increased delay to ensure styles apply
            } else {
              // Fallback: print immediately if receipt not found
              setTimeout(() => {
                window.focus();
                window.print();
              }, 500);
            }
          }, 100);
        }
        
        // Start the process
        calculateAndPrint();
      };
      
      window.onafterprint = () => {
        if (window.opener === null && window.parent === window) {
          window.close();
        }
      };
    </script>
  </body>
</html>
`);
        frameDoc.close();
        
        // Wait for content to load, then resize iframe and print (respects kiosk-printing)
        setTimeout(() => {
          if (printFrame.contentWindow && frameDoc.body) {
            // Wait for images to load
            const images = frameDoc.querySelectorAll('img');
            let imagesLoaded = 0;
            const totalImages = images.length;
            
            function calculateAndPrintIframe() {
              if (totalImages === 0) {
                proceedWithPrintIframe();
              } else {
                images.forEach((img: any) => {
                  if (img.complete) {
                    imagesLoaded++;
                    if (imagesLoaded === totalImages) {
                      proceedWithPrintIframe();
                    }
                  } else {
                    img.onload = () => {
                      imagesLoaded++;
                      if (imagesLoaded === totalImages) {
                        proceedWithPrintIframe();
                      }
                    };
                    img.onerror = () => {
                      imagesLoaded++;
                      if (imagesLoaded === totalImages) {
                        proceedWithPrintIframe();
                      }
                    };
                  }
                });
              }
            }
            
            function proceedWithPrintIframe() {
              setTimeout(() => {
                if (!frameDoc) return;
                
                const receipt = frameDoc.querySelector('.receipt') as HTMLElement;
                const body = frameDoc.body;
                
                if (receipt && body) {
                  // Get actual content height - use receipt container's height only
                  const receiptEl = receipt as HTMLElement;
                  const contentHeight = receiptEl.scrollHeight || receiptEl.offsetHeight;
                  
                  // Only add minimal padding (1mm top + 1mm bottom = 2mm total)
                  const paddingMM = 2;
                  const contentHeightMM = Math.ceil((contentHeight * 0.264583) + paddingMM);
                  
                  // Resize iframe to content height
                  printFrame.style.height = contentHeight + 'px';
                  
                  // Update @page size dynamically in iframe
                  const style = frameDoc.createElement('style');
                  style.id = 'dynamic-page-size-iframe';
                  const existingStyle = frameDoc.getElementById('dynamic-page-size-iframe');
                  if (existingStyle) {
                    existingStyle.remove();
                  }
                  // Set page size immediately - NO TOP MARGIN, minimal padding
                  style.textContent = '@page { size: 100mm ' + contentHeightMM + 'mm !important; margin: 0 !important; } @media print { @page { size: 100mm ' + contentHeightMM + 'mm !important; margin: 0 !important; padding: 0 !important; } html, body { width: 100mm !important; height: ' + contentHeightMM + 'mm !important; min-height: ' + contentHeightMM + 'mm !important; max-height: ' + contentHeightMM + 'mm !important; margin: 0 !important; padding: 0 !important; } .receipt { margin: 0 !important; padding: 1mm 2mm !important; } body > * { margin-top: 0 !important; padding-top: 0 !important; } .receipt > *:first-child { margin-top: 0 !important; padding-top: 0 !important; } }';
                  frameDoc.head.appendChild(style);
                  
                  // Wait for style to apply, then print
                  setTimeout(() => {
                    if (printFrame.contentWindow) {
                      printFrame.contentWindow.focus();
                      printFrame.contentWindow.print();
                      
                      // Cleanup after print
                      setTimeout(() => {
                        if (printFrame.parentNode) {
                          printFrame.parentNode.removeChild(printFrame);
                        }
                      }, 2000);
                    }
                  }, 100);
                }
              }, 100);
            }
            
            calculateAndPrintIframe();
          }
        }, 600); // Wait for barcode generation
      }
      
      return; // Exit early for kiosk mode
    }
    
    // Normal mode: Use window.open (ONLY if kiosk mode not detected)
    // WARNING: window.open() does NOT respect --kiosk-printing flag and will ALWAYS show print dialog
    console.warn('⚠️ Using window.open (normal mode) - Print dialog WILL appear');
    console.warn('⚠️ If you want silent printing, ensure URL has ?kiosk-printing=true parameter');
    const w = window.open("", "_blank", "width=400,height=200");
    if (!w) return;

    w.document.open();
    w.document.write(`
<html>
  <head>
    <title>Receipt</title>
    <!-- JsBarcode CDN for professional barcodes -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
   <style>
      /* Thermal printer optimized styles with larger fonts */
      html, body { 
        margin: 0; 
        padding: 0; 
        background: white;
        height: auto;
        min-height: auto;
      }
      
       body { 
          font-family: 'Courier New', monospace; 
          font-size: 12px;
          line-height: 1.2;
          color: #000000;
          font-weight: bold;
          display: block;
          padding: 0;
        }

    .receipt {
          width: 100mm;
          max-width: 500px;
          background: white;
          color: #000000;
          font-weight: bold;
          text-align: center;
          padding: 1mm 2mm;
          margin: 0;
          box-sizing: border-box;
          height: auto;
          min-height: auto;
        }

      /* Logo specific styles */
      .logo {
        text-align: center;
        margin-bottom: 12px; /* Increased from 8px */
      }
      
      .logo img {
        max-width: 180px; /* Increased from 160px */
        height: 50px; /* Increased from 40px */
        display: block;
        margin: 0 auto;
        object-fit: contain;
      }
      
      .store-header {
        font-weight: 900;
        font-size: 24px; /* Increased from 16px */
        margin-bottom: 6px; /* Increased from 4px */
        color: #000000;
      }
      
      .tagline, .address {
        font-size: 16px; /* Increased from 10px */
        margin-bottom: 4px; /* Increased from 2px */
        color: #000000;
        font-weight: bold;
      }
      
      .divider {
        margin: 6px 0; /* Increased from 4px */
        color: #000000;
        font-weight: bold;
        border: none;
        text-align: center;
        font-size: 16px; /* Added explicit size */
      }
      
      .receipt-info, .payment-info {
        text-align: left;
        font-size: 16px; /* Increased from 10px */
        margin: 4px 0; /* Increased from 2px */
        color: #000000;
        font-weight: bold;
      }
      
      .receipt-number, .payment-method {
        font-weight: 900;
        color: #000000;
      }
      
      .flex-item-row-cs{
        display: flex;
        justify-content: space-between;
        align-items: center;           
        width: 100%;
        box-sizing: border-box;
        white-space: nowrap; /* Prevent line breaks */
      }

      /* Improved items section with larger fonts */
      .items-section {
        margin: 8px 0; /* Increased from 6px */
        font-size: 16px; /* Increased from 10px */
        line-height: 1.4; /* Increased from 1.3 */
        font-family: 'Courier New', monospace;
        font-weight: bold;
      }

      .items-header {
        display: flex;
        justify-content: space-between;
        font-weight: 900;
        font-size: 18px; /* Increased - was not specified */
        margin-bottom: 6px; /* Increased from 4px */
        padding-bottom: 3px; /* Increased from 2px */
        border-bottom: 2px solid #000; /* Made thicker from 1px */
      }

      .items-header .item-col {
        flex: 2;
        text-align: left;
      }

      .items-header .qty-col {
        flex: 1;
        text-align: center;
        min-width: 70px; /* Increased from 60px */
      }

      .items-header .rate-col {
        flex: 1;
        text-align: right;
        min-width: 90px; /* Increased from 80px */
      }

      .item-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin: 4px 0; /* Increased from 3px */
        min-height: 20px; /* Increased from 16px */
        font-weight: bold;
        font-size: 16px; /* Added explicit size */
      }

      .item-name {
        flex: 2;
        text-align: left;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        line-height: 1.3; /* Increased from 1.2 */
        padding-right: 8px;
      }

      .item-qty {
        flex: 1;
        text-align: center;
        min-width: 70px; /* Increased from 60px */
        white-space: nowrap;
      }

      .item-rate {
        flex: 1;
        text-align: right;
        min-width: 90px; /* Increased from 80px */
        white-space: nowrap;
      }

      /* Special styling for sub-items */
      .item-sub-row {
        display: flex;
        margin: 2px 0 4px 0; /* Increased from 1px 0 3px 0 */
        font-style: italic;
        opacity: 0.8;
        font-size: 14px; /* Increased from 9px */
      }

      .item-sub-name {
        flex: 2;
        text-align: left;
        padding-left: 12px; /* Increased from 10px */
        padding-right: 8px;
      }

      .item-sub-qty {
        flex: 1;
        text-align: center;
        min-width: 70px; /* Increased from 60px */
      }

      .item-sub-rate {
        flex: 1;
        text-align: right;
        min-width: 90px; /* Increased from 80px */
      }
      
      .totals {
        text-align: right;
        font-size: 16px; /* Increased from 10px */
        margin: 4px 0; /* Increased from 2px */
        color: #000000;
        font-weight: bold;
      }
      
      .subtotal-section {
        border-top: 2px solid black; /* Made thicker from 1px */
        padding-top: 6px; /* Increased from 4px */
        margin-top: 8px; /* Increased from 6px */
        font-weight: bold;
      }
      
      .grand-total {
        font-weight: 900;
        font-size: 18px; /* Increased from 12px */
        color: #000000;
        margin: 6px 0; /* Increased from 4px */
        border-top: 2px solid black; /* Made thicker from 1px */
        border-bottom: 2px solid black; /* Made thicker from 1px */
        padding: 4px 0; /* Increased from 2px */
      }
      
      .promo {
        padding: 6px; /* Increased from 4px */
        margin: 8px 0; /* Increased from 6px */
        font-size: 14px; /* Increased from 9px */
        color: #000000;
        font-weight: bold;
        text-align: left;
      }
      
      /* Professional barcode styling */
      .barcode-section {
        text-align: center;
        margin: 10px 0; /* Increased spacing */
      }
      
      .barcode {
        margin: 8px 0; /* Increased from 6px */
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .barcode svg {
        max-width: 100%;
        height: 50px; /* Professional barcode height */
      }
      
      .barcode-number {
        font-size: 14px; /* Increased from 10px */
        color: #000000;
        margin-top: 6px; /* Increased from 4px */
        font-weight: bold;
        letter-spacing: 2px; /* Added for better readability */
      }
      
      .thank-you {
        font-size: 17px; /* Increased from 11px */
        margin-top: 10px; /* Increased from 8px */
        font-weight: 900;
        color: #000000;
        padding-top: 6px; /* Increased from 4px */
      }

      /* Print optimization - Set very small initial size to prevent paper waste */
      @page {
        size: 100mm 50mm;
        margin: 0;
        padding: 0;
      }
      
      /* Override Chrome's default print page size */
      @media print {
        @page {
          size: 100mm auto !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
      
      @media print {
        @page {
          size: 100mm auto;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        html, body {
          width: 100mm !important;
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: #000000 !important;
          overflow: visible !important;
        }
        
        .receipt {
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 1mm 2mm !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
        
        /* Ensure no top spacing */
        body > * {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        .receipt > *:first-child {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        /* Logo print styles */
        .logo img {
          max-width: 140px !important;
          height: 50px !important;
          display: block !important;
          margin: 0 auto !important;
          object-fit: contain !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        
        /* Force black text for printing but preserve images */
        * {
          color: #000000 !important;
          font-weight: bold !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Barcode print optimization */
        .barcode svg {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Specific exclusion for images */
        img, svg {
          background: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt">${receiptContent}</div>
    <script>
      // Generate professional barcode after content loads
      window.onload = function() {
        const barcodeElement = document.getElementById('barcode-svg');
        const barcodeNumber = document.getElementById('barcode-number').textContent;
        
        if (barcodeElement && barcodeNumber && window.JsBarcode) {
          try {
            JsBarcode(barcodeElement, barcodeNumber, {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: false,
              margin: 0,
              background: "#ffffff",
              lineColor: "#000000"
            });
          } catch (error) {
            console.error('Barcode generation failed:', error);
            // Fallback to text-based barcode
            barcodeElement.innerHTML = '<div style="font-family: monospace; font-size: 18px;">||||| |||| ||||| ||||</div>';
          }
        }
        
        // Wait for all images and content to load before calculating height
        function calculateAndPrint() {
          // Wait for images to load
          const images = document.querySelectorAll('img');
          let imagesLoaded = 0;
          const totalImages = images.length;
          
          if (totalImages === 0) {
            // No images, proceed immediately
            proceedWithPrint();
          } else {
            images.forEach(img => {
              if (img.complete) {
                imagesLoaded++;
                if (imagesLoaded === totalImages) {
                  proceedWithPrint();
                }
              } else {
                img.onload = () => {
                  imagesLoaded++;
                  if (imagesLoaded === totalImages) {
                    proceedWithPrint();
                  }
                };
                img.onerror = () => {
                  imagesLoaded++;
                  if (imagesLoaded === totalImages) {
                    proceedWithPrint();
                  }
                };
              }
            });
          }
        }
        
        function proceedWithPrint() {
          // Small delay to ensure everything is rendered
          setTimeout(() => {
            const receipt = document.querySelector('.receipt');
            const body = document.body;
            
            if (receipt && body) {
              // Get actual content height - use the receipt container's height, not body
              // This ensures we match the content exactly without extra space
              const receiptElement = receipt as HTMLElement;
              const receiptHeight = receiptElement.scrollHeight || receiptElement.offsetHeight;
              
              // Only add minimal padding (1mm top + 1mm bottom = 2mm total)
              const paddingMM = 2;
              const receiptHeightMM = Math.ceil((receiptHeight * 0.264583) + paddingMM); // Convert px to mm
              
              // Update @page size dynamically using inline style - Set immediately to prevent paper waste
              const style = document.createElement('style');
              style.id = 'dynamic-page-size';
              const existingStyle = document.getElementById('dynamic-page-size');
              if (existingStyle) {
                existingStyle.remove();
              }
              // Set page size exactly to content height - NO TOP MARGIN, minimal padding
              // Force page size aggressively to override printer driver settings
              style.textContent = '@page { size: 100mm ' + receiptHeightMM + 'mm !important; margin: 0 !important; } @media print { @page { size: 100mm ' + receiptHeightMM + 'mm !important; margin: 0 !important; padding: 0 !important; } html, body { width: 100mm !important; height: ' + receiptHeightMM + 'mm !important; min-height: ' + receiptHeightMM + 'mm !important; max-height: ' + receiptHeightMM + 'mm !important; margin: 0 !important; padding: 0 !important; } .receipt { margin: 0 !important; padding: 1mm 2mm !important; } body > * { margin-top: 0 !important; padding-top: 0 !important; } .receipt > *:first-child { margin-top: 0 !important; padding-top: 0 !important; } }';
              document.head.appendChild(style);
              
              // Also try to set print media properties via JavaScript
              try {
                const mediaQuery = window.matchMedia('print');
                if (mediaQuery && mediaQuery.matches) {
                  // Force apply styles during print
                }
              } catch (e) {
                // Ignore if not supported
              }
              
              // Resize window to fit content height (only for window.open, not iframe)
              if (window.opener === null && window.parent === window) {
                const padding = 20;
                window.resizeTo(400, Math.min(receiptHeight + padding, screen.height));
              }
              
              // Wait longer for styles to apply before printing
              setTimeout(() => {
                window.focus();
                // Try to print with explicit page size
                const printWindow = window as any;
                if (printWindow.document && printWindow.document.body) {
                  printWindow.document.body.style.height = receiptHeightMM + 'mm';
                }
                window.print();
              }, 200); // Increased delay to ensure styles apply
            } else {
              // Fallback: print immediately if receipt not found
              setTimeout(() => {
                window.focus();
                window.print();
              }, 500);
            }
          }, 100);
        }
        
        // Start the process
        calculateAndPrint();
      };
      
      window.onafterprint = () => {
        if (window.opener === null && window.parent === window) {
          window.close();
        }
      };
    </script>
  </body>
</html>
`);
    w.document.close();
  };

  const downloadReceipt = (receiptData: any, branchName: any) => {
    // Calculate discount dynamically
    const discount = receiptData.discount || 0;
    const finalTotal = receiptData.subtotal - discount;

    const receiptContent = `
 <div class="logo">
<img 
  src="${window.location.origin}/logo.png" 
  alt="Logo" 
  style="max-width:140px;height:50px;display:block;margin:0 auto;
         object-fit:contain;
         filter: grayscale(100%) contrast(200%);
         image-rendering: pixelated;
         -webkit-print-color-adjust: exact; 
         print-color-adjust: exact;" />
</div>
<div class="store-header">${receiptData.storeName || "MANPASAND GENERAL STORE"
      }</div>
<div class="tagline">${receiptData.tagline || "Quality • Service • Value"}</div>
<div class="address">${branchName.address + ", Karachi" || "Main Shahrah-e-Faisal, Karachi"
      }</div>

<div class="divider">-------------------------------------</div>

<div class="receipt-info">Receipt # <span class="receipt-number">${receiptData.transactionId
      }</span></div>
<div class="receipt-info">${new Date(receiptData.timestamp).toLocaleDateString(
        "en-US",
        {
          month: "short",
          day: "2-digit",
          year: "numeric",
        }
      )} ${new Date(receiptData.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })}</div>
<div class="flex-item-row-cs">
<div class="receipt-info">Cashier: ${receiptData.cashier || "Walk-in"}</div>
<div class="receipt-info">${receiptData.customerType || "Walk-in"}</div>  
</div>

<div class="divider">-------------------------------------</div>

<div class="items-section">
<div class="items-header">
  <div class="item-col">ITEM</div>
  <div class="qty-col">QTY</div>
  <div class="rate-col">RATE</div>
</div>

${receiptData.items
        .map((item: any) => {
          const itemName =
            item.name.length > 20 ? item.name.substring(0, 17) + "..." : item.name;
          const qty = `${item.quantity} pc`;
          const rate = `PKR ${(item.price * item.quantity).toFixed(1)}`;

          return `<div class="item-row">
            <div class="item-name">${itemName}</div>
            <div class="item-qty">${qty}</div>
            <div class="item-rate">${rate}</div>
          </div>
          ${item.name.length > 20
              ? `<div class="item-sub-row"><div class="item-sub-name">${item.name}</div><div class="item-sub-qty"></div><div class="item-sub-rate"></div></div>`
              : ""
            }`;
        })
        .join("")}
</div>

<div class="divider">-------------------------------------</div>

<div class="flex-item-row-cs">
<div class="receipt-info">Subtotal</div>
<div class="receipt-info">PKR ${receiptData.subtotal.toFixed(2)}</div>
</div>
${discount > 0
        ? `
<div class="flex-item-row-cs">
<div class="receipt-info">Discount</div>
<div class="receipt-info">PKR ${discount.toFixed(2)}</div>
</div>`
        : ""
      }
<div class="flex-item-row-cs">
<div class="receipt-info">Grand Total</div>
<div class="receipt-info">PKR ${finalTotal.toFixed(2)}</div>
</div>

<div class="divider">-------------------------------------</div>
<div class="flex-item-row-cs">
<div class="payment-info">Payment Method:</div>
<div class="payment-method">${receiptData.paymentMethod.toUpperCase()}</div>
</div>
<div class="flex-item-row-cs">
<div class="payment-info">Amount Paid:</div>
<div class="payment-method">PKR ${receiptData.amountPaid
        ? receiptData.amountPaid.toFixed(2)
        : finalTotal.toFixed(2)
      }</div> 
</div>
${receiptData.changeAmount && receiptData.changeAmount > 0
        ? `
<div class="flex-item-row-cs">
<div class="payment-info">Change:</div>
<div class="payment-method">PKR ${receiptData.changeAmount.toFixed(2)}</div>
</div>`
        : ""
      }
  
${receiptData.promo ? `<div class="promo">${receiptData.promo}</div>` : ""}

<div class="barcode-section">
<div class="barcode">
  <svg id="barcode-svg"></svg>
</div>
<div class="barcode-number" id="barcode-number">${receiptData.transactionId
      }</div>
</div>

<div class="thank-you">${receiptData.thankYouMessage || "Thank you for shopping with us!"
      }</div>
<div style="font-size: 15px; margin-top: 6px; font-weight: bold; color: #000000;">${receiptData.footerMessage || "Visit us again soon!"
      }</div>
`;

    // Print the receipt - re-check kiosk mode to ensure it's detected
    const isKioskDetected = kioskMode || isKioskMode();
    printReceipt(receiptContent, isKioskDetected);
  };

  const handlePayment = async (method: string) => {
    await withPaymentLoading(async () => {
      try {
        // Prepare items for API
        const saleItems = cart.map((item) => ({
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
            const branchObj = branchStr;
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

        // Call create sale API and get the response
        const saleResponse = await apiClient.post("/sale", payload);
        const saleData = saleResponse.data.data;

        // Use the sale_number from backend as transaction ID
        const transactionId = saleData.sale_number || generateTransactionId();
        const receiptData = generateReceiptData(
          transactionId,
          method,
          cart,
          subtotal,
          total
        );

        // Save transaction to local storage (simulate database)
        const transactions = JSON.parse(
          localStorage.getItem("transactions") || "[]"
        );
        transactions.push(receiptData);
        localStorage.setItem("transactions", JSON.stringify(transactions));

        setLastTransactionId(transactionId);
        setCart([]);
        setPaymentDialogOpen(false);

        toast({
          title: "Payment Successful",
          description: `Transaction ${transactionId} completed via ${method}`,
        });

        // Auto-print receipt
        try {
          // Prepare receipt data for local print server (same format as backend)
          const receiptDataForServer: ReceiptData = {
            storeName: branchName.name || "MANPASAND GENERAL STORE",
            tagline: "Quality • Service • Value",
            address: branchName.address ? `${branchName.address}, Karachi` : "Main Shahrah-e-Faisal, Karachi",
            transactionId: transactionId,
            timestamp: new Date().toISOString(),
            cashier: receiptData.cashier || "Walk-in",
            customerType: selectedCustomer 
              ? customers.find(c => c.id === selectedCustomer)?.name || "Walk-in" 
              : "Walk-in",
            items: cart.map(item => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              unit: 'pc'
            })),
            subtotal: subtotal,
            discount: discountAmount > 0 ? discountAmount : undefined,
            taxPercent: taxPercentForReceipt > 0 ? taxPercentForReceipt : undefined,
            total: total,
            paymentMethod: method === "Cash" ? "CASH" : "CARD",
            amountPaid: total,
            changeAmount: 0,
            thankYouMessage: "Thank you for shopping!",
            footerMessage: "Visit us again soon!"
          };

          // Get printer name - use selected printer or default
          const printerName = kioskMode 
            ? 'Default Printer' 
            : selectedPrinter || 'BlackCopper 80mm Series';

          const printerObj = {
            name: printerName,
            columns: { fontA: 48, fontB: 64 } // Default columns
          };

          const job = {
            copies: 1,
            cut: true,
            openDrawer: false
          };

          // Try local print server first, fallback to browser print
          // Use same API format as backend: printer, receiptData, job
          const printSuccess = await printReceiptViaServer(printerObj, receiptDataForServer, job);

          if (printSuccess.success) {
            toast({
              title: "Receipt Printed",
              description: `Receipt sent to ${printerName}`,
            });
          } else {
            // Fallback to browser print if server failed
            console.warn('Print server failed, using browser print:', printSuccess.error);
            downloadReceipt(receiptData, branchName);
          }
          
          // Old browser printing code removed - now uses local print server with browser fallback
          
        } catch (printError) {
          console.error("Print error:", printError);
          toast({
            variant: "destructive",
            title: "Print Failed",
            description: "Receipt could not be printed. Please try again.",
          });
        }
      } catch (error) {
        console.error("Payment error:", error);
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: "There was an error processing your payment",
        });
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

      toast({
        title: "Barcode Scanned",
        description: `Found ${randomProduct.name}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Scan Failed",
        description: "Could not read barcode",
      });
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

        toast({
          title: "Product Added",
          description: `${product.name} added to cart via barcode scan`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Product Not Found",
          description: `No product found with barcode: ${scannedValue}`,
        });
      }
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

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Products Section */}
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">New Sales</h1>
              <p className="text-sm text-orange-600 font-medium">
                ⚠️ TESTING MODE: Negative sales allowed
              </p>
              {lastTransactionId && (
                <p className="text-sm text-green-600">
                  Last transaction: {lastTransactionId}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LoadingButton
                variant="outline"
                size="icon"
                loading={isAnyLoading}
                onClick={refreshAllData}
                title="Refresh Data"
              >
                <RefreshCw className="h-4 w-4" />
              </LoadingButton>
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
            <LoadingButton
              variant="outline"
              size="icon"
              loading={scanLoading}
              onClick={handleBarcodeScan}
            >
              <Scan className="h-4 w-4" />
            </LoadingButton>
          </div>
        </div>

        {!kioskMode ? (
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
                    onChange={(e) => setSelectedPrinter(e.target.value)}
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
        ) : (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            🖨️ Kiosk mode active. Receipts print automatically using the default printer.
          </div>
        )}

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
              const currentStock = product.available_stock ?? product.stock;
              const isOutOfStock = currentStock <= 0;
              const isLowStock = currentStock <= 5 && currentStock > 0;

              return (
                <Card
                  key={product.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow`}
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-4">
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center relative">
                      <span className="text-2xl">🛒</span>
                      {cartItem && (
                        <Badge className="absolute -top-2 -right-2 bg-blue-600">
                          {cartItem.quantity.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    <p className="text-lg font-bold text-blue-600">
                      Rs {product.price.toFixed(2)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p
                        className={`text-sm ${isLowStock ? "text-yellow-600" : "text-gray-500"
                          }`}
                      >
                        Stock:{" "}
                        {(product.available_stock ?? product.stock).toFixed(2)}
                      </p>
                      {isLowStock && (
                        <Badge
                          variant="secondary"
                          className="bg-yellow-100 text-yellow-800"
                        >
                          Low Stock
                        </Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="mt-2">
                      {product.category}
                    </Badge>
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
                        onClick={() => retrieveHoldSale(index)}
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
          <div className="h-full overflow-auto px-4 py-3">
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
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-gray-900 leading-snug">{item.name}</h4>
                        <p className="text-xs text-gray-500">
                          Unit: Rs {item.price.toFixed(2)} • Total: Rs {(item.price * item.quantity).toFixed(2)}
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
                          type="number"
                          value={item.price}
                          onChange={(e) => updateItemPrice(item.id, parseFloat(e.target.value))}
                          className="mt-1 h-8 text-sm"
                          min="0"
                          step="0.01"
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
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const value = e.target.value;
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

                              const numValue = parseFloat(value);
                              if (!isNaN(numValue)) {
                                updateQuantityManual(item.id, numValue);
                              }
                            }}
                            onBlur={(e) => {
                              const value = parseFloat(e.target.value);
                              if (isNaN(value) || value <= 0) {
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, quantity: 0.01 };
                                    }
                                    return cartItem;
                                  })
                                );
                              }
                            }}
                            className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            min="0"
                            step="0.01"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Discount
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <select
                        className="h-8 rounded border border-gray-200 px-2 text-xs"
                        value={globalDiscountType}
                        onChange={(e) =>
                          setGlobalDiscountType(e.target.value as "percentage" | "amount")
                        }
                      >
                        <option value="percentage">%</option>
                        <option value="amount">Rs</option>
                      </select>
                      <Input
                        type="number"
                        value={globalDiscount}
                        onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                        className="h-8 flex-1 text-xs"
                        min="0"
                        step={globalDiscountType === "percentage" ? "1" : "0.01"}
                        max={globalDiscountType === "percentage" ? "100" : undefined}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Tax
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <select
                        className="h-8 rounded border border-gray-200 px-2 text-xs"
                        value={taxType}
                        onChange={(e) => setTaxType(e.target.value as "percentage" | "amount")}
                      >
                        <option value="percentage">%</option>
                        <option value="amount">Rs</option>
                      </select>
                      <Input
                        type="number"
                        value={taxValue}
                        onChange={(e) => setTaxValue(Number.isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))}
                        className="h-8 flex-1 text-xs"
                        min="0"
                        step={taxType === "percentage" ? "0.1" : "0.01"}
                        max={taxType === "percentage" ? "100" : undefined}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-gray-600 text-xs font-medium">
                    <span>Subtotal</span>
                    <span>Rs {subtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="mt-1 flex items-center justify-between text-green-600 text-xs font-medium">
                      <span>Discount</span>
                      <span>- Rs {discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div className="mt-1 flex items-center justify-between text-gray-600 text-xs font-medium">
                      <span>{taxLabel}</span>
                      <span>Rs {taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-blue-700 text-sm font-semibold">
                    <span>Payable</span>
                    <span>Rs {total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  onClick={() => handlePayment("Cash")}
                  disabled={paymentLoading || (!kioskMode && !selectedPrinter)}
                  title={!kioskMode && !selectedPrinter ? "Please select a printer" : ""}
                  className="h-10 text-sm"
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePayment("Card")}
                  disabled={paymentLoading || (!kioskMode && !selectedPrinter)}
                  title={!kioskMode && !selectedPrinter ? "Please select a printer" : ""}
                  className="h-10 text-sm"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Card
                </Button>
              </div>

              {!kioskMode && !selectedPrinter && (
                <p className="text-xs text-center font-medium text-orange-600">
                  ⚠️ Select a printer to enable payments
                </p>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}