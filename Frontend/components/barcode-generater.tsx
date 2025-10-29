"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { CancelTokenSource } from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  Package,
  Search,
  Loader2,
  RefreshCw,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { PageLoader } from "./ui/page-loader";
import { usePosData } from "@/hooks/use-pos-data";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import axios from "axios";
import { isKioskMode, silentPrint, enableKioskMode } from "@/utils/kiosk-printing";

interface Product {
  id: string;
  code?: string;
  name: string;
  sku?: string;
  barcode?: string;
  sales_rate_exc_dis_and_tax?: number;
  unitName?: string;
  category?: string;
  brandName?: string;
  weight?: string;
  mfgDate?: string;
  expDate?: string;
}

interface SelectedProductItem {
  id: string;
  product: Product;
  netWeight: string;
  packageDate: Date;
  expiryDuration: string;
  expiryDate?: Date;
}

export default function BarcodeGenerator() {
  const [selectedProducts, setSelectedProducts] = useState<
    SelectedProductItem[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentProductId, setCurrentProductId] = useState("");
  const [globalExpiryDuration, setGlobalExpiryDuration] = useState("");
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [selectedPaperSize, setSelectedPaperSize] = useState("3x2inch");
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const printerRequestRef = useRef<CancelTokenSource | null>(null);
  const { toast } = useToast();
  const [kioskMode, setKioskMode] = useState(false);

  // Detect kiosk mode on mount
  useEffect(() => {
    const kiosk = isKioskMode();
    setKioskMode(kiosk);
    if (kiosk) {
      // In kiosk mode, set default printer and skip printer detection
      setSelectedPrinter('Default Printer');
      setAvailablePrinters([{ name: 'Default Printer', id: 'default', isDefault: true, status: 'available' }]);
      
      // Optional: Enable kiosk mode in localStorage for future sessions
      enableKioskMode();
      
      toast({
        title: "Kiosk Mode Detected",
        description: "Printing will use default printer automatically",
      });
    }
  }, []);

  const expiryOptions = [
    { value: "3", label: "3 Months" },
    { value: "6", label: "6 Months" },
    { value: "12", label: "12 Months" },
    { value: "18", label: "18 Months" },
    { value: "24", label: "24 Months" },
    { value: "36", label: "36 Months" },
  ];

  const paperSizes = [
    { value: "50x30mm", label: "50mm x 30mm (Standard)" },
    { value: "60x40mm", label: "60mm x 40mm (Large)" },
    { value: "40x25mm", label: "40mm x 25mm (Small)" },
    { value: "3x2inch", label: "3\" x 2\" (Zebra/ZDesigner - 76mm x 51mm)" },
    { value: "76x51mm", label: "76mm x 51mm (3\" x 2\" Alternative)" },
  ];

  // Direct printing function
  const printDirectly = () => {
    window.print();
  };

  // Generate proper barcode using JsBarcode
  const generateBarcodeDataURL = (value: string): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 80;

    try {
      JsBarcode(canvas, value, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000",
      });
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("Error generating barcode:", error);
      // Fallback: return empty data URL
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    }
  };

  const calculateExpiryDate = (
    packageDate: Date,
    durationMonths: string
  ): Date | undefined => {
    if (!durationMonths) return undefined;
    const months = parseInt(durationMonths, 10);
    if (isNaN(months)) return undefined;
    const expiry = new Date(packageDate);
    expiry.setMonth(expiry.getMonth() + months);
    return expiry;
  };

  // Global store with custom hook
  const {
    products,
    productsLoading,
    isAnyLoading,
    refreshAllData,
    fetchProducts,
  } = usePosData();


  // Handle initial load and search
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (searchTerm.length >= 2) {
          await fetchProducts(true, searchTerm);
        } else {
          await fetchProducts();
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to load data",
          description: "Could not fetch products from server",
        });
      }
    };

    const debounceTimer = setTimeout(fetchData, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  // Fetch printers on component mount with delay to avoid conflicts
  useEffect(() => {
    console.log('🖨️ useEffect for printers triggered');
    const timer = setTimeout(() => {
      console.log('🖨️ Timer fired, calling fetchPrinters');
      fetchPrinters();
    }, 2000); // 2 second delay to avoid conflicts with products API
    
    return () => {
      console.log('🖨️ useEffect cleanup');
      clearTimeout(timer);
      // Cancel any pending printer request on unmount
      if (printerRequestRef.current) {
        printerRequestRef.current.cancel('Component unmounted');
      }
    };
  }, []);

  const parseWeightToGrams = (weightInput: any) => {
    if (!weightInput || weightInput.trim() === "") return 0;

    const input = weightInput.toLowerCase().trim();
    let weight = 0;

    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return 0;

    const number = Number.parseFloat(numberMatch[1]);

    if (input.includes("kg")) {
      weight = number * 1000;
    } else if (input.includes("g") && !input.includes("kg")) {
      weight = number;
    } else if (input.includes("ml") || input.includes("l")) {
      if (input.includes("ml")) {
        weight = number;
      } else if (input.includes("l")) {
        weight = number * 1000;
      }
    } else {
      weight = number;
    }

    return weight;
  };

  const calculatePriceByWeight = (netWeightInput: any, basePrice: any) => {
    if (!netWeightInput || !basePrice) return basePrice || 0;

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return basePrice;

    const weightValue = Number.parseFloat(numberMatch[1]);
    if (weightValue <= 0) return basePrice;

    let multiplier = 1;

    if (input.includes("kg") || input.includes("kilo")) {
      multiplier = weightValue;
    } else if (
      input.includes("g") &&
      !input.includes("kg") &&
      !input.includes("mg")
    ) {
      multiplier = weightValue / 1000;
    } else if (input.includes("mg")) {
      multiplier = weightValue / 1000000;
    } else if (input.includes("lb") || input.includes("pound")) {
      multiplier = weightValue * 0.453592;
    } else if (input.includes("oz") && !input.includes("fl")) {
      multiplier = weightValue * 0.0283495;
    } else if (
      input.includes("l") &&
      !input.includes("ml") &&
      !input.includes("fl")
    ) {
      multiplier = weightValue;
    } else if (input.includes("ml") || input.includes("milliliter")) {
      multiplier = weightValue / 1000;
    } else if (input.includes("ser") || input.includes("seer")) {
      multiplier = weightValue * 0.933105;
    } else if (input.includes("maund")) {
      multiplier = weightValue * 37.3242;
    } else if (
      input.includes("pc") ||
      input.includes("piece") ||
      input.includes("pcs")
    ) {
      multiplier = weightValue;
    } else if (input.includes("dozen")) {
      multiplier = weightValue * 12;
    } else {
      multiplier = weightValue / 1000;
    }

    const finalPrice = basePrice * multiplier;
    return finalPrice.toFixed(2);
  };

  const formatWeightDisplay = (netWeightInput: any) => {
    if (!netWeightInput) return "Not specified";

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return netWeightInput;

    const number = Number.parseFloat(numberMatch[1]);

    if (input.includes("kg")) return `${number}kg`;
    if (input.includes("g") && !input.includes("kg") && !input.includes("mg"))
      return `${number}g`;
    if (input.includes("mg")) return `${number}mg`;
    if (input.includes("lb")) return `${number}lb`;
    if (input.includes("oz") && !input.includes("fl")) return `${number}oz`;
    if (input.includes("l") && !input.includes("ml")) return `${number}L`;
    if (input.includes("ml")) return `${number}ml`;
    if (input.includes("ser")) return `${number} seer`;
    if (input.includes("maund")) return `${number} maund`;
    if (input.includes("pc") || input.includes("piece")) return `${number} pcs`;
    if (input.includes("dozen")) return `${number} dozen`;

    return `${number}g`;
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku &&
          product.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [products, searchTerm]);

  const addProduct = () => {
    if (!currentProductId) return;

    const product = products.find((p) => p.id === currentProductId);
    if (!product) return;

    if (selectedProducts.some((sp) => sp.product.id === currentProductId)) {
      toast({
        variant: "destructive",
        title: "Product already selected",
        description: "This product is already in the list.",
      });
      return;
    }

    const newItem: SelectedProductItem = {
      id: Date.now().toString(),
      product,
      netWeight: "",
      packageDate: new Date(),
      expiryDuration: "",
    };

    if (globalExpiryDuration) {
      newItem.expiryDuration = globalExpiryDuration;
      newItem.expiryDate = calculateExpiryDate(
        newItem.packageDate,
        globalExpiryDuration
      );
    }

    setSelectedProducts((prev) => [...prev, newItem]);
    setCurrentProductId("");
  };

  const removeProduct = (itemId: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateProductData = (
    itemId: string,
    field: keyof SelectedProductItem,
    value: any
  ) => {
    setSelectedProducts((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };
          if (field === "expiryDuration") {
            updatedItem.expiryDate = calculateExpiryDate(
              updatedItem.packageDate,
              value
            );
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const applyGlobalDates = () => {
    if (!globalExpiryDuration) return;

    setSelectedProducts((prev) => {
      const updated = prev.map((item) => ({
        ...item,
        expiryDuration: globalExpiryDuration,
        expiryDate: calculateExpiryDate(item.packageDate, globalExpiryDuration),
      }));

      toast({
        title: "Expiry duration applied",
        description: `Global expiry duration has been applied to all ${updated.length} products.`,
      });

      return updated;
    });
  };

  const clearAll = () => {
    setSelectedProducts([]);
    toast({
      title: "Cleared",
      description: "All products have been removed from the list.",
    });
  };

  // Client-side printer detection using browser APIs
  const detectClientPrinters = async (): Promise<any[]> => {
    const printers: any[] = [];
    
    // Method 1: Try Web Print API (Chrome/Edge - experimental)
    try {
      // @ts-ignore - Experimental API
      if ('printer' in navigator && navigator.printer) {
        // @ts-ignore
        const printerList = await navigator.printer.getPrinters();
        if (printerList && printerList.length > 0) {
          return printerList.map((p: any) => ({
            name: p.name || p.printerName,
            id: `client-${Date.now()}-${Math.random()}`,
            isDefault: p.isDefault || false,
            status: 'available'
          }));
        }
      }
    } catch (e) {
      console.log('Web Print API not available:', e);
    }

    // Method 2: Try getting default printer via print dialog workaround
    // Note: This doesn't actually open the dialog, just detects default
    try {
      // Check if browser supports print preview
      const defaultPrinter = localStorage.getItem('last_used_printer');
      if (defaultPrinter) {
        printers.push({
          name: defaultPrinter,
          id: `client-default-${Date.now()}`,
          isDefault: true,
          status: 'available'
        });
      }
    } catch (e) {
      console.log('Default printer detection failed:', e);
    }

    return printers;
  };

  // Fetch available printers - Client-side detection first, then backend, then manual
  const fetchPrinters = async () => {
    console.log('🖨️ fetchPrinters called - attempting client-side detection');
    
    setIsLoadingPrinters(true);
    try {
      // Step 1: Try client-side browser detection
      const clientPrinters = await detectClientPrinters();
      if (clientPrinters.length > 0) {
        console.log('🖨️ Found printers from client device:', clientPrinters);
        setAvailablePrinters(clientPrinters);
        const defaultPrinter = clientPrinters.find((p: any) => p.isDefault) || clientPrinters[0];
        setSelectedPrinter(defaultPrinter.name);
        localStorage.setItem('saved_printers', JSON.stringify(clientPrinters));
        setIsLoadingPrinters(false);
        return;
      }

      // Step 2: Try to get printers from localStorage
      const savedPrinters = localStorage.getItem('saved_printers');
      if (savedPrinters) {
        try {
          const parsedPrinters = JSON.parse(savedPrinters);
          if (Array.isArray(parsedPrinters) && parsedPrinters.length > 0) {
            console.log('🖨️ Loaded printers from localStorage:', parsedPrinters);
            setAvailablePrinters(parsedPrinters);
            setSelectedPrinter(parsedPrinters[0].name);
            setIsLoadingPrinters(false);
            return;
          }
        } catch (e) {
          console.error('Failed to parse saved printers:', e);
        }
      }

      // Step 3: Try backend API (works for local development, not Vercel)
      try {
        const cancelToken = axios.CancelToken.source();
        printerRequestRef.current = cancelToken;
        
        console.log('🖨️ Making API call to /barcode-generator/printers');
        const response = await apiClient.get('/barcode-generator/printers', {
          cancelToken: cancelToken.token,
          timeout: 5000 // Shorter timeout since Vercel returns empty
        });
        
        console.log('🖨️ API response:', response.data);
        const printers = response.data.data || [];
        
        if (printers.length > 0) {
          setAvailablePrinters(printers);
          localStorage.setItem('saved_printers', JSON.stringify(printers));
          const defaultPrinter = printers.find((p: any) => p.isDefault);
          if (defaultPrinter) {
            setSelectedPrinter(defaultPrinter.name);
          } else {
            setSelectedPrinter(printers[0].name);
          }
          setIsLoadingPrinters(false);
          return;
        }
      } catch (apiError: any) {
        console.log('🖨️ Backend API not available or returned empty (expected on Vercel):', apiError.message);
        // This is expected on Vercel, continue to manual entry
      }

      // Step 4: No printers found - show manual entry option
      console.log('🖨️ No printers detected automatically - user can add manually');
      setAvailablePrinters([]);
      setSelectedPrinter('');
      
      toast({
        title: "Printer Detection",
        description: "No printers detected automatically. Please add your printer manually.",
        variant: "default"
      });
      
    } catch (error: any) {
      console.error("Failed to fetch printers:", error);
      setAvailablePrinters([]);
      setSelectedPrinter('');
    } finally {
      setIsLoadingPrinters(false);
      printerRequestRef.current = null;
    }
  };

  // Detect printer by opening print dialog (user selects, we capture selection)
  const detectPrinterViaDialog = () => {
    toast({
      title: "Detect Printer",
      description: "Open print dialog and select your printer. The printer name will be saved.",
    });
    
    // Create a temporary print preview to capture printer selection
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please allow pop-ups to detect your printer",
      });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Printer Detection</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              text-align: center;
            }
            @media print {
              body { display: none; }
            }
          </style>
        </head>
        <body>
          <h2>Select your printer from the print dialog</h2>
          <p>After selecting, you'll be prompted to save the printer name.</p>
          <script>
            window.onbeforeprint = function() {
              window.opener.postMessage('print-dialog-opened', '*');
            };
            window.onafterprint = function() {
              setTimeout(() => {
                const printerName = prompt('Enter the printer name you selected:', '');
                if (printerName && printerName.trim()) {
                  window.opener.postMessage({ type: 'printer-detected', name: printerName.trim() }, '*');
                }
                window.close();
              }, 100);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Listen for printer name from print dialog
    const messageHandler = (event: MessageEvent) => {
      if (event.data === 'print-dialog-opened') {
        printWindow?.print();
      } else if (event.data?.type === 'printer-detected' && event.data.name) {
        const newPrinter = {
          name: event.data.name,
          id: `client-${Date.now()}`,
          isDefault: availablePrinters.length === 0,
          status: 'available'
        };
        const updatedPrinters = [...availablePrinters, newPrinter];
        setAvailablePrinters(updatedPrinters);
        setSelectedPrinter(newPrinter.name);
        localStorage.setItem('saved_printers', JSON.stringify(updatedPrinters));
        localStorage.setItem('last_used_printer', newPrinter.name);
        window.removeEventListener('message', messageHandler);
        
        toast({
          title: "Printer Detected",
          description: `Printer "${newPrinter.name}" has been added`,
        });
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Auto-trigger print dialog after a short delay
    setTimeout(() => {
      if (printWindow && !printWindow.closed) {
        printWindow.print();
      }
    }, 500);
  };


  const handlePrintAll = async () => {
    if (selectedProducts.length === 0) return;

    const invalidProducts = selectedProducts.filter(
      (item) => !item.netWeight.trim() || !item.packageDate || !item.expiryDate
    );

    if (invalidProducts.length > 0) {
      toast({
        variant: "destructive",
        title: "Incomplete data",
        description: `${invalidProducts.length} products are missing required information.`,
      });
      return;
    }

    setIsPrinting(true);
    
    // In kiosk mode: Direct browser print (silent, uses default printer)
    if (kioskMode) {
      try {
        await printWithBrowser();
        toast({
          title: "Printing",
          description: "Labels sent to default printer",
        });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Print Error",
          description: error.message || "Failed to print labels",
        });
      } finally {
        setIsPrinting(false);
      }
      return;
    }

    // Normal mode: Try backend API first, then fallback
    if (!selectedPrinter && !kioskMode) {
      toast({
        variant: "destructive",
        title: "No Printer Selected",
        description: "Please select a printer before printing.",
      });
      setIsPrinting(false);
      return;
    }

    try {
      // Try backend API first (for non-kiosk mode with selected printer)
      try {
        const requestData = {
          printerName: selectedPrinter,
          copies: 1,
          paperSize: selectedPaperSize,
          dpi: 203,
          humanReadable: false,
          lines: { 
            showTitle: true, 
            showMeta: true, 
            showDates: true 
          },
          items: selectedProducts.map((sp) => ({
            id: sp.product.id,
            name: sp.product.name,
            sku: sp.product.sku,
            code: sp.product.code,
            barcode: `${sp.product.sku || sp.product.code || 'PROD'}-${Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)))}`,
            netWeight: sp.netWeight,
            price: Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax))),
            packageDateISO: sp.packageDate.toISOString(),
            expiryDateISO: sp.expiryDate?.toISOString(),
          }))
        };
        
        const response = await apiClient.post('/barcode-generator/print-zebra', requestData);

        if (response.data.success) {
          toast({
            title: "Print Success",
            description: response.data.message || "Barcodes sent to printer successfully",
          });
          setIsPrinting(false);
          return;
        } else {
          throw new Error(response.data.message || "Print failed");
        }
      } catch (backendError: any) {
        console.log('Backend print failed, falling back to browser print:', backendError);
        await printWithBrowser();
      }
    } catch (error: any) {
      console.error('Printing error:', error);
      toast({
        variant: "destructive",
        title: "Print Error",
        description: error.message || "Failed to print labels",
      });
      setIsPrinting(false);
    }
  };

  // Browser-based printing - optimized for kiosk mode
  const printWithBrowser = async () => {
    // In kiosk mode: Create minimal print window that closes automatically
    if (kioskMode) {
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        throw new Error('Could not open print window');
      }
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Barcode Labels</title>
          <style>
            @media print {
              @page {
                size: ${selectedPaperSize === '3x2inch' ? '3in 2in' : selectedPaperSize === '50x30mm' ? '50mm 30mm' : selectedPaperSize === '60x40mm' ? '60mm 40mm' : '76mm 51mm'};
                margin: 0;
              }
              body { margin: 0; padding: 0; }
              .label { 
                page-break-inside: avoid;
                page-break-after: always;
                padding: 5mm;
              }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 10mm;
            }
            .label {
              border: 1px dashed #ddd;
              padding: 5mm;
              margin-bottom: 10mm;
              text-align: center;
            }
            .title {
              font-weight: bold;
              font-size: 13pt;
              margin-bottom: 2mm;
              text-transform: uppercase;
            }
            .meta {
              font-size: 9pt;
              margin-bottom: 2mm;
            }
            .barcode-container {
              margin: 5mm 0;
            }
            .barcode {
              max-width: 100%;
              height: auto;
            }
            .dates {
              font-size: 9pt;
              border-top: 1px solid #ccc;
              padding-top: 2mm;
              margin-top: 5mm;
            }
          </style>
        </head>
        <body>
          ${selectedProducts.map((sp) => {
            const barcodeValue = `${sp.product.sku || sp.product.code || 'PROD'}-${Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)))}`;
            const barcodeDataURL = generateBarcodeDataURL(barcodeValue);
            const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
            
            return `
              <div class="label">
                <div class="title">${sp.product.name}</div>
                <div class="meta">NET WT: ${formatWeightDisplay(sp.netWeight)} | RS ${price}</div>
                <div class="barcode-container">
                  <img src="${barcodeDataURL}" alt="Barcode" class="barcode" />
                </div>
                <div class="dates">PKG: ${formatDate(sp.packageDate)} | EXP: ${formatDate(sp.expiryDate)}</div>
              </div>
            `;
          }).join('')}
        </body>
        <script>
          window.onload = function() {
            setTimeout(() => {
              window.print();
              // In kiosk mode, close automatically after print
              setTimeout(() => window.close(), 500);
            }, 100);
          };
        </script>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setIsPrinting(false);
      return;
    }

    // Normal mode: Standard print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Could not open print window');
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Barcode Labels</title>
        <style>
          @media print {
            @page {
              size: ${selectedPaperSize === '3x2inch' ? '3in 2in' : selectedPaperSize === '50x30mm' ? '50mm 30mm' : selectedPaperSize === '60x40mm' ? '60mm 40mm' : '76mm 51mm'};
              margin: 0;
            }
            body { margin: 0; padding: 0; }
            .label { 
              page-break-inside: avoid;
              page-break-after: always;
              padding: 5mm;
            }
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 10mm;
          }
          .label {
            border: 1px dashed #ddd;
            padding: 5mm;
            margin-bottom: 10mm;
            text-align: center;
          }
          .title {
            font-weight: bold;
            font-size: 13pt;
            margin-bottom: 2mm;
            text-transform: uppercase;
          }
          .meta {
            font-size: 9pt;
            margin-bottom: 2mm;
          }
          .barcode-container {
            margin: 5mm 0;
          }
          .barcode {
            max-width: 100%;
            height: auto;
          }
          .dates {
            font-size: 9pt;
            border-top: 1px solid #ccc;
            padding-top: 2mm;
            margin-top: 5mm;
          }
        </style>
      </head>
      <body>
        ${selectedProducts.map((sp) => {
          const barcodeValue = `${sp.product.sku || sp.product.code || 'PROD'}-${Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)))}`;
          const barcodeDataURL = generateBarcodeDataURL(barcodeValue);
          const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
          
          return `
            <div class="label">
              <div class="title">${sp.product.name}</div>
              <div class="meta">NET WT: ${formatWeightDisplay(sp.netWeight)} | RS ${price}</div>
              <div class="barcode-container">
                <img src="${barcodeDataURL}" alt="Barcode" class="barcode" />
              </div>
              <div class="dates">PKG: ${formatDate(sp.packageDate)} | EXP: ${formatDate(sp.expiryDate)}</div>
            </div>
          `;
        }).join('')}
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      
      // After printing, prompt user to save printer name if not already saved
      printWindow.onbeforeunload = () => {
        const savedPrinter = localStorage.getItem('last_used_printer');
        if (selectedPrinter && selectedPrinter !== savedPrinter) {
          localStorage.setItem('last_used_printer', selectedPrinter);
          // Check if printer exists in list, if not add it
          const printerExists = availablePrinters.some(p => p.name === selectedPrinter);
          if (!printerExists && selectedPrinter !== 'Default Printer') {
            const newPrinter = {
              name: selectedPrinter,
              id: `client-${Date.now()}`,
              isDefault: false,
              status: 'available'
            };
            const updatedPrinters = [...availablePrinters, newPrinter];
            setAvailablePrinters(updatedPrinters);
            localStorage.setItem('saved_printers', JSON.stringify(updatedPrinters));
          }
        }
      };
      
      setTimeout(() => {
        printWindow.close();
        setIsPrinting(false);
        toast({
          title: "Print Dialog Opened",
          description: selectedPrinter ? `Select your printer: ${selectedPrinter}` : "Select your printer from the dialog",
        });
      }, 100);
    }, 250);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "__/__/____";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const isFormValid =
    selectedProducts.length > 0 &&
    selectedProducts.every(
      (item) => item.netWeight.trim() && item.packageDate && item.expiryDate
    );

  if (productsLoading && products.length === 0) {
    return <PageLoader message="Loading Barcode Generator..." />;
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Product Selection and Form */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Multi-Product Barcode Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">


            {/* Search */}
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="search">Search Products</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by name, SKU, or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Product Selection */}
            <div className="space-y-2">
              <Label htmlFor="product">
                Add Product ({filteredProducts.length} available)
              </Label>
              <div className="flex gap-2">
                <Select
                  onValueChange={setCurrentProductId}
                  value={currentProductId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{product.name}</span>
                          <span className="text-xs text-gray-500">
                            SKU: {product.sku} | Rs{" "}
                            {product.sales_rate_exc_dis_and_tax}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={addProduct} disabled={!currentProductId}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Printer Selection - Hidden in kiosk mode */}
            {!kioskMode ? (
              <div className="space-y-2 border-t pt-4">
                <Label>Select Printer</Label>
                <div className="flex gap-2">
                  <Select
                    onValueChange={setSelectedPrinter}
                    value={selectedPrinter}
                    disabled={isLoadingPrinters}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={isLoadingPrinters ? "Loading printers..." : "Choose a printer"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePrinters.map((printer) => (
                        <SelectItem key={printer.name} value={printer.name}>
                          <div className="flex items-center gap-2">
                            <span>{printer.name}</span>
                            {printer.isDefault && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
                                Default
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => fetchPrinters()}
                    variant="outline"
                    size="sm"
                    disabled={isLoadingPrinters}
                    title="Refresh printers"
                  >
                    {isLoadingPrinters ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    onClick={detectPrinterViaDialog}
                    variant="outline"
                    size="sm"
                    title="Detect printer from your device"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => {
                      const printerName = prompt('Enter printer name:');
                      if (printerName && printerName.trim()) {
                        const newPrinter = {
                          name: printerName.trim(),
                          id: `manual-${Date.now()}`,
                          isDefault: availablePrinters.length === 0,
                          status: 'available'
                        };
                        const updatedPrinters = [...availablePrinters, newPrinter];
                        setAvailablePrinters(updatedPrinters);
                        setSelectedPrinter(newPrinter.name);
                        localStorage.setItem('saved_printers', JSON.stringify(updatedPrinters));
                        localStorage.setItem('last_used_printer', newPrinter.name);
                        toast({
                          title: "Printer Added",
                          description: `Printer "${newPrinter.name}" has been added`,
                        });
                      }
                    }}
                    variant="outline"
                    size="sm"
                    title="Add printer manually"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {isLoadingPrinters && (
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading printers...
                  </div>
                )}
                {availablePrinters.length === 0 && !isLoadingPrinters && (
                <div className="text-xs text-gray-500 space-y-2">
                  <div>No printers found.</div>
                  <div className="flex gap-2">
                    <Button
                      onClick={detectPrinterViaDialog}
                      variant="outline"
                      size="sm"
                      className="text-xs flex-1"
                    >
                      <Search className="h-3 w-3 mr-1" />
                      Detect Printer
                    </Button>
                    <Button
                      onClick={() => {
                        const printerName = prompt('Enter printer name:');
                        if (printerName && printerName.trim()) {
                          const newPrinter = {
                            name: printerName.trim(),
                            id: `manual-${Date.now()}`,
                            isDefault: availablePrinters.length === 0,
                            status: 'available'
                          };
                          const updatedPrinters = [...availablePrinters, newPrinter];
                          setAvailablePrinters(updatedPrinters);
                          setSelectedPrinter(newPrinter.name);
                          localStorage.setItem('saved_printers', JSON.stringify(updatedPrinters));
                          localStorage.setItem('last_used_printer', newPrinter.name);
                          toast({
                            title: "Printer Added",
                            description: `Printer "${newPrinter.name}" has been added`,
                          });
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="text-xs flex-1"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Manually
                    </Button>
                  </div>
                </div>
                )}
              </div>
            ) : null}

            {/* Paper Size Selection */}
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="paperSize">Paper Size</Label>
              <Select
                onValueChange={setSelectedPaperSize}
                value={selectedPaperSize}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select paper size" />
                </SelectTrigger>
                <SelectContent>
                  {paperSizes.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Global Dates */}
            <div className="space-y-2 border-t pt-4">
              <Label>Global Expiry (Apply to All)</Label>
              <div className="grid grid-cols-1 gap-2">
                <Select
                  onValueChange={setGlobalExpiryDuration}
                  value={globalExpiryDuration}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose global expiry" />
                  </SelectTrigger>
                  <SelectContent>
                    {expiryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={applyGlobalDates}
                  variant="outline"
                  size="sm"
                  disabled={
                    !globalExpiryDuration || selectedProducts.length === 0
                  }
                >
                  Apply to All Products
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 border-t pt-4">
              <Button
                onClick={handlePrintAll}
                className="w-full"
                disabled={!isFormValid || isPrinting || (!kioskMode && !selectedPrinter)}
              >
                {isPrinting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                <Printer className="h-4 w-4 mr-2" />
                )}
                {isPrinting ? "Printing..." : `Print All Barcodes (${selectedProducts.length})`}
              </Button>
              <Button
                onClick={clearAll}
                variant="outline"
                className="w-full"
                disabled={selectedProducts.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Selected Products List */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Selected Products ({selectedProducts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProducts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No products selected yet.</p>
                <p className="text-sm">Add products from the dropdown above.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {selectedProducts.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{item.product.name}</h3>
                        <p className="text-sm text-gray-600">
                          SKU: {item.product.sku}
                        </p>
                        <p className="text-sm text-gray-600">
                          Price: Rs {item.product.sales_rate_exc_dis_and_tax}
                        </p>
                      </div>
                      <Button
                        onClick={() => removeProduct(item.id)}
                        variant="outline"
                        size="sm"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={`weight-${item.id}`}>
                          Net Weight *
                        </Label>
                        <Input
                          id={`weight-${item.id}`}
                          value={item.netWeight}
                          onChange={(e) =>
                            updateProductData(
                              item.id,
                              "netWeight",
                              e.target.value
                            )
                          }
                          placeholder="e.g., 500g, 1kg"
                        />
                      </div>
                      <div>
                        <Label>Package Date</Label>
                        <Input
                          value={formatDate(item.packageDate)}
                          readOnly
                          className="bg-gray-100"
                        />
                      </div>
                      <div>
                        <Label>Expiry Duration *</Label>
                        <Select
                          onValueChange={(value) =>
                            updateProductData(item.id, "expiryDuration", value)
                          }
                          value={item.expiryDuration}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Set expiry" />
                          </SelectTrigger>
                          <SelectContent>
                            {expiryOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Individual Preview with Proper Barcode */}
                    <div className="bg-gray-50 p-3 rounded border">
                      <div className="text-center space-y-2">
                        <div className="font-bold text-sm">
                          {item.product.name.toUpperCase()}
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>
                            Net Wt: {formatWeightDisplay(item.netWeight)}
                          </span>
                          <span>
                            Price: Rs{" "}
                            {Math.round(
                              Number(
                                calculatePriceByWeight(
                                  item.netWeight,
                                  item.product.sales_rate_exc_dis_and_tax
                                )
                              )
                            )}
                          </span>
                        </div>
                        <div className="flex justify-center bg-white p-2 rounded">
                          <img
                            src={generateBarcodeDataURL(
                              `${
                                item.product.sku || item.product.code || "PROD"
                              }-${Math.round(
                                Number(
                                  calculatePriceByWeight(
                                    item.netWeight,
                                    item.product.sales_rate_exc_dis_and_tax
                                  )
                                )
                              )}`
                            )}
                            alt="Barcode Preview"
                            className="max-w-full h-10 object-contain"
                          />
                        </div>
                        <div className="flex justify-between text-xs border-t pt-2">
                          <span>PKG: {formatDate(item.packageDate)}</span>
                          <span>EXP: {formatDate(item.expiryDate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
