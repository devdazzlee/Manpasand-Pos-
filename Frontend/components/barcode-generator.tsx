"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Printer,
  Search,
  Loader2,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { BarcodeScanIcon } from "@/components/icons/barcode-scan-icon";
import JsBarcode from "jsbarcode";
import { PageLoader } from "./ui/page-loader";
import { useProducts } from "@/hooks/queries/use-products";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { extractApiError } from "@/lib/api/errors";
import { isKioskMode, silentPrint, enableKioskMode } from "@/utils/kiosk-printing";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { encodeLabelBarcodeValue } from "@/lib/labelBarcode";

interface Product {
  id: string;
  code?: string;
  name: string;
  sku?: string;
  barcode?: string;
  sales_rate_exc_dis_and_tax?: number;
  unitName?: string;
  unitId?: string;
  category?: string;
  brandName?: string;
  weight?: string;
  mfgDate?: string;
  expDate?: string;
  is_active?: boolean;
  current_stock?: number;
  stock?: number;
}

interface SelectedProductItem {
  id: string;
  product: Product;
  netWeight: string;
  packageDate: Date;
  expiryDuration: string;
  expiryDate?: Date;
  copies: number;
}

const TABLE_PAGE_SIZE = 20;

export default function BarcodeGenerator() {
  const [selectedProducts, setSelectedProducts] = useState<
    SelectedProductItem[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [globalExpiryDuration, setGlobalExpiryDuration] = useState("12");
  // Global default net weight + a global copies value so a whole batch can be
  // configured in one click for bulk printing workflows.
  const [globalNetWeight, setGlobalNetWeight] = useState("");
  const [globalCopies, setGlobalCopies] = useState("1");
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  // Global printer settings (configured in Printer Settings page)
  const { barcodePrinter, printers: globalPrinters } = usePrinterSettings();
  const [selectedPaperSize, setSelectedPaperSize] = useState("3x2inch");
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [kioskMode, setKioskMode] = useState(false);

  // Product picker table state
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tablePage, setTablePage] = useState(1);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // What gets printed on the label — wired into generatePDFAndPrint below.
  const [includeProductName, setIncludeProductName] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeSku, setIncludeSku] = useState(false);

  // Bulk Upload tab
  const [bulkParsing, setBulkParsing] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Detect kiosk mode on mount
  useEffect(() => {
    const kiosk = isKioskMode();
    setKioskMode(kiosk);
    if (kiosk) {
      enableKioskMode();
    }
  }, []);

  useEffect(() => {
    productSearchInputRef.current?.focus();
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
    { value: "50x30mm", label: "50 × 30 mm" },
    { value: "60x40mm", label: "60 × 40 mm" },
    { value: "40x25mm", label: "40 × 25 mm" },
    { value: "3x2inch", label: "3 × 2 in (Zebra)" },
    { value: "76x51mm", label: "76 × 51 mm" },
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

  const buildSelectedItem = (
    product: Product,
    overrides?: Partial<Pick<SelectedProductItem, "netWeight" | "expiryDuration" | "copies">>,
  ): SelectedProductItem => {
    const expiryDuration = overrides?.expiryDuration || globalExpiryDuration || "12";
    const packageDate = new Date();
    return {
      id: `${Date.now()}-${product.id}`,
      product,
      netWeight: overrides?.netWeight || globalNetWeight || "",
      packageDate,
      expiryDuration,
      expiryDate: calculateExpiryDate(packageDate, expiryDuration),
      copies: Math.max(1, overrides?.copies ?? (parseInt(globalCopies, 10) || 1)),
    };
  };

  const withPrintDefaults = (item: SelectedProductItem): SelectedProductItem => {
    const packageDate = item.packageDate || new Date();
    const expiryDuration = item.expiryDuration || globalExpiryDuration || "12";
    return {
      ...item,
      packageDate,
      expiryDuration,
      expiryDate: item.expiryDate || calculateExpiryDate(packageDate, expiryDuration),
      copies: Math.max(1, item.copies || 1),
    };
  };

  useEffect(() => {
    const delay = searchTerm.trim().length >= 2 ? 250 : 0;
    const t = window.setTimeout(
      () => setDebouncedSearch(searchTerm.trim()),
      delay,
    );
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  const {
    products: rawProducts,
    isFirstLoad,
    isRefreshing,
    error: listError,
  } = useProducts({
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    isActive: true,
    page: 1,
    limit: 20,
  });
  const products = rawProducts as unknown as Product[];

  useEffect(() => {
    if (!listError) return;
    toast({
      variant: "destructive",
      title: "Failed to load data",
      description: extractApiError(
        listError,
        "Could not fetch products from server",
      ),
    });
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // CRITICAL: Preserve the exact input string to avoid any conversion errors
    // Only format if it's a valid weight string, otherwise return as-is
    const input = String(netWeightInput).toLowerCase().trim();
    
    // If input is already a formatted string like "200g", preserve it exactly
    if (input.match(/^\d+\.?\d*\s*(kg|g|mg|lb|oz|l|ml|ser|maund|pc|pcs|piece|dozen)$/i)) {
      // Extract number and unit, but preserve exact format
      const numberMatch = input.match(/(\d+\.?\d*)/);
      const unitMatch = input.match(/(kg|g|mg|lb|oz|l|ml|ser|maund|pc|pcs|piece|dozen)/i);
      
      if (numberMatch && unitMatch) {
        const number = Number.parseFloat(numberMatch[1]);
        const unit = unitMatch[1].toLowerCase();
        
        // Return formatted but preserve the exact number (no rounding)
        if (unit === "kg") return `${number}kg`;
        if (unit === "g") return `${number}g`;
        if (unit === "mg") return `${number}mg`;
        if (unit === "lb") return `${number}lb`;
        if (unit === "oz") return `${number}oz`;
        if (unit === "l") return `${number}L`;
        if (unit === "ml") return `${number}ml`;
        if (unit === "ser" || unit === "seer") return `${number} seer`;
        if (unit === "maund") return `${number} maund`;
        if (unit === "pc" || unit === "pcs" || unit === "piece") return `${number} pcs`;
        if (unit === "dozen") return `${number} dozen`;
      }
    }
    
    // If it's just a number, assume grams
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (numberMatch) {
      const number = Number.parseFloat(numberMatch[1]);
      return `${number}g`; // Default to grams
    }

    // Return original if can't parse
    return String(netWeightInput);
  };

  // Helper function to determine if unit is weight-based (kg, g, etc.) or piece-based (pc, pcs, etc.)
  const isWeightUnit = (unitName?: string): boolean => {
    if (!unitName) return true; // Default to weight if no unit specified
    const unit = unitName.toLowerCase().trim();
    return (
      unit.includes("kg") ||
      unit.includes("kilo") ||
      unit.includes("gram") ||
      unit.includes("g") ||
      unit.includes("mg") ||
      unit.includes("lb") ||
      unit.includes("pound") ||
      unit.includes("oz") ||
      unit.includes("ounce") ||
      unit.includes("l") ||
      unit.includes("liter") ||
      unit.includes("ml") ||
      unit.includes("milliliter") ||
      unit.includes("ser") ||
      unit.includes("seer") ||
      unit.includes("maund")
    );
  };

  // Generate dropdown options based on unit type
  const getNetWeightOptions = (unitName?: string): Array<{ value: string; label: string }> => {
    const isWeight = isWeightUnit(unitName);
    
    if (isWeight) {
      // Weight-based options (grams and kg)
      return [
        { value: "100g", label: "100g" },
        { value: "200g", label: "200g" },
        { value: "300g", label: "300g" },
        { value: "500g", label: "500g" },
        { value: "600g", label: "600g" },
        { value: "700g", label: "700g" },
        { value: "1000g", label: "1000g" },
        { value: "1kg", label: "1kg" },
        { value: "custom", label: "Custom" },
      ];
    } else {
      // Piece-based options - store with "pc" suffix for proper formatting
      return [
        { value: "1 pc", label: "1 pc" },
        { value: "2 pcs", label: "2 pcs" },
        { value: "3 pcs", label: "3 pcs" },
        { value: "4 pcs", label: "4 pcs" },
        { value: "5 pcs", label: "5 pcs" },
        { value: "6 pcs", label: "6 pcs" },
        { value: "10 pcs", label: "10 pcs" },
        { value: "12 pcs", label: "12 pcs" },
        { value: "custom", label: "Custom" },
      ];
    }
  };

  // Every non-empty category currently in the catalog, for the table filter.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.is_active !== false && p.category) set.add(p.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    // Inactive products are kept out of the barcode generator — there's no
    // point printing barcodes for items that can't be sold.
    let list = products.filter((p) => p.is_active !== false);

    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category === categoryFilter);
    }

    return list;
  }, [products, categoryFilter]);

  // Reset to page 1 whenever the visible set changes, so the user never
  // lands on a page that no longer exists after filtering.
  useEffect(() => {
    setTablePage(1);
  }, [searchTerm, categoryFilter]);

  const totalTablePages = Math.max(1, Math.ceil(filteredProducts.length / TABLE_PAGE_SIZE));
  const pagedProducts = useMemo(
    () => filteredProducts.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE),
    [filteredProducts, tablePage],
  );

  const isProductSelected = (productId: string) =>
    selectedProducts.some((sp) => sp.product.id === productId);

  const handleProductSelect = (productId: string, options?: { keepSearch?: boolean }) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // If the product is already in the list, bump its copies count instead
    // of rejecting — matches the scan-to-add behaviour and supports the bulk
    // workflow where you re-pick the same item to print extra labels.
    const existing = selectedProducts.find((sp) => sp.product.id === productId);
    if (existing) {
      const nextCopies = (existing.copies || 1) + 1;
      setSelectedProducts((prev) =>
        prev.map((sp) =>
          sp.product.id === productId ? { ...sp, copies: nextCopies } : sp,
        ),
      );
      sonnerToast.success(`${product.name}`, {
        description: `Copies set to ${nextCopies}`,
        position: "top-right",
        duration: 300,
      });
      if (!options?.keepSearch) {
        setSearchTerm("");
        productSearchInputRef.current?.focus();
      }
      return;
    }

    setSelectedProducts((prev) => [...prev, buildSelectedItem(product)]);
    sonnerToast.success(`Added ${product.name}`, {
      description: `SKU ${product.sku || product.code || ""}`.trim(),
      position: "top-right",
      duration: 300,
    });
    if (!options?.keepSearch) {
      setSearchTerm("");
      productSearchInputRef.current?.focus();
    }
  };

  // Table row checkbox — add or remove a single product from the selection.
  const toggleProductRow = (product: Product) => {
    const existingItem = selectedProducts.find((sp) => sp.product.id === product.id);
    if (existingItem) {
      removeProduct(existingItem.id);
    } else {
      handleProductSelect(product.id, { keepSearch: true });
    }
  };

  // Silent bulk-add — used by "select all on this page" and Bulk Upload, so
  // adding many products doesn't spam a toast per item.
  const addProductsBulk = (productsToAdd: Product[]) => {
    if (productsToAdd.length === 0) return 0;
    let addedCount = 0;
    setSelectedProducts((prev) => {
      const existingIds = new Set(prev.map((sp) => sp.product.id));
      const additions: SelectedProductItem[] = productsToAdd
        .filter((p) => !existingIds.has(p.id))
        .map((p) => buildSelectedItem(p));
      addedCount = additions.length;
      return [...prev, ...additions];
    });
    return addedCount;
  };

  const allOnPageSelected =
    pagedProducts.length > 0 && pagedProducts.every((p) => isProductSelected(p.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      const pageIds = new Set(pagedProducts.map((p) => p.id));
      setSelectedProducts((prev) => prev.filter((sp) => !pageIds.has(sp.product.id)));
      return;
    }
    const added = addProductsBulk(pagedProducts.filter((p) => !isProductSelected(p.id)));
    if (added > 0) {
      sonnerToast.success(`Added ${added} product${added === 1 ? "" : "s"}`, {
        position: "top-right",
        duration: 800,
      });
    }
  };

  // Scan-to-add: if the user presses Enter and the search matches exactly one
  // product (by SKU, code, or full name), add it immediately. If a product is
  // already selected, bump its copies count instead of duplicating the row.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const term = searchTerm.trim();
    if (!term) return;
    const lower = term.toLowerCase();
    const exact =
      products.find((p) => (p.sku || "").toLowerCase() === lower) ||
      products.find((p) => (p.code || "").toLowerCase() === lower) ||
      products.find((p) => p.name.toLowerCase() === lower);
    const match = exact || (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (!match) return;
    e.preventDefault();
    const already = selectedProducts.find((sp) => sp.product.id === match.id);
    if (already) {
      setSelectedProducts((prev) =>
        prev.map((sp) =>
          sp.product.id === match.id ? { ...sp, copies: sp.copies + 1 } : sp,
        ),
      );
      setSearchTerm("");
      return;
    }
    handleProductSelect(match.id);
  };

  const removeProduct = (itemId: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Bulk Upload tab — parse a CSV/XLSX of SKUs (with optional Net Weight /
  // Expiry Months / Copies columns) and add every matched product at once.
  const downloadBulkTemplate = () => {
    const csv = "SKU,Net Weight,Expiry Months,Copies\nSKU001,500g,12,2\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "barcode_bulk_upload_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkParsing(true);
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const existingIds = new Set(selectedProducts.map((sp) => sp.product.id));
      const additions: SelectedProductItem[] = [];
      let notFound = 0;

      rows.forEach((row) => {
        const skuRaw = String(row.SKU ?? row.sku ?? row.Code ?? row.code ?? "").trim();
        if (!skuRaw) return;
        const lower = skuRaw.toLowerCase();
        const product = products.find(
          (p) =>
            p.is_active !== false &&
            ((p.sku || "").toLowerCase() === lower || (p.code || "").toLowerCase() === lower),
        );
        if (!product) {
          notFound += 1;
          return;
        }
        if (existingIds.has(product.id)) return;
        existingIds.add(product.id);

        const netWeight =
          String(row["Net Weight"] ?? row.NetWeight ?? row.netWeight ?? "").trim() ||
          globalNetWeight ||
          "";
        const expiryDuration =
          String(row["Expiry Months"] ?? row.ExpiryMonths ?? row.expiryMonths ?? "").trim() ||
          globalExpiryDuration ||
          "12";
        const copiesRaw = parseInt(String(row.Copies ?? row.copies ?? ""), 10);
        const copies =
          Number.isFinite(copiesRaw) && copiesRaw > 0
            ? copiesRaw
            : Math.max(1, parseInt(globalCopies, 10) || 1);

        additions.push(
          buildSelectedItem(product, { netWeight, expiryDuration, copies }),
        );
      });

      if (additions.length) {
        setSelectedProducts((prev) => [...prev, ...additions]);
      }

      toast({
        variant: additions.length === 0 ? "destructive" : "default",
        title: additions.length === 0 ? "No products matched" : "Bulk upload processed",
        description:
          additions.length === 0
            ? "None of the SKUs in that file matched a product."
            : `${additions.length} product${additions.length === 1 ? "" : "s"} added` +
              (notFound ? `, ${notFound} row${notFound === 1 ? "" : "s"} didn't match any SKU.` : "."),
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err?.message || "Could not read that file. Use the CSV template.",
      });
    } finally {
      setBulkParsing(false);
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
    }
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

  const clearAll = () => {
    setSelectedProducts([]);
    toast({
      title: "Cleared",
      description: "All products have been removed from the list.",
    });
  };

  // Printer loading is handled globally by usePrinterSettings hook

  // Printer detection is now handled globally in Printer Settings page


  const handlePrintAll = async () => {
    if (selectedProducts.length === 0) {
      toast({
        variant: "destructive",
        title: "No products selected",
        description: "Search and tap a product first, then print.",
      });
      return;
    }

    setIsPrinting(true);
    
    try {
      // Generate PDF in frontend and open browser print dialog (like boxhero.io)
      await generatePDFAndPrint();
      toast({
        title: "Print Dialog Opened",
        description: "Select your printer from the print dialog",
      });
    } catch (error: any) {
      console.error('Printing error:', error);
      toast({
        variant: "destructive",
        title: "Print Error",
        description: error.message || "Failed to generate PDF. Please install jspdf: npm install jspdf",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Generate PDF in frontend and open for browser print (like boxhero.io)
  const generatePDFAndPrint = async () => {
    // Dynamic import of jsPDF (install: npm install jspdf)
    const { jsPDF } = await import('jspdf');
    
    // Paper size: 58mm x 40mm (landscape/horizontal) - same as boxhero.io
    const labelWidth = 58; // mm
    const labelHeight = 40; // mm
    
    // Convert mm to points (1mm = 2.83464567 points)
    const mmToPt = (mm: number) => mm * 2.83464567;
    const widthPt = mmToPt(labelWidth);
    const heightPt = mmToPt(labelHeight);
    
    // Margins (1.5mm on all sides like boxhero.io)
    const margin = 1.5;
    const marginPt = mmToPt(margin);
    const contentWidth = widthPt - (marginPt * 2);
    const contentHeight = heightPt - (marginPt * 2);
    
    // Create PDF document (landscape: width > height)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: [widthPt, heightPt]
    });
    
    // Set default text color to pure black for darker text
    doc.setTextColor(0, 0, 0);
    
    // Font sizes - larger and darker for better visibility
    const titleFontSize = 10; // pt - larger for better visibility
    const labelFontSize = 8; // pt - bold labels (NET WT, PKG, EXP) - larger
    const valueFontSize = 8; // pt - bold values - larger
    const priceFontSize = 9; // pt - price in bold - larger
    
    // Expand each product into N labels based on its copies count, so a
    // single click prints continuous strips from the thermal printer.
    const labelsToRender: SelectedProductItem[] = selectedProducts
      .map(withPrintDefaults)
      .flatMap((sp) => {
        const n = Math.max(1, sp.copies || 1);
        return Array.from({ length: n }, () => sp);
      });

    // Process each label
    for (let labelIdx = 0; labelIdx < labelsToRender.length; labelIdx++) {
      const sp = labelsToRender[labelIdx];
      // Add new page for each label after the first
      if (labelIdx > 0) {
        doc.addPage([widthPt, heightPt], 'landscape');
      }
      
      // Start lower from top - use more of the label space
      let y = marginPt + mmToPt(3); // Start 3mm from top margin (pushed down)
      const leftMargin = marginPt;
      
      // Title (Product Name) - centered, bold, larger, dark
      if (includeProductName) {
        const title = (sp.product.name || '').toUpperCase().trim();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        doc.setTextColor(0, 0, 0); // Pure black for darker text

        // Calculate text width and wrap if needed (max 2 lines)
        const titleLines = doc.splitTextToSize(title, contentWidth * 0.95);
        const titleHeight = Math.min(titleLines.length, 2) * titleFontSize * 1.4;

        // Center the title
        titleLines.slice(0, 2).forEach((line: string, index: number) => {
          const lineWidth = doc.getTextWidth(line);
          const lineX = leftMargin + (contentWidth - lineWidth) / 2;
          doc.text(line, lineX, y + titleFontSize + (index * titleFontSize * 1.4));
        });

        y += titleHeight + mmToPt(0.8); // More spacing
      }

      // SKU line (optional) - small, left-aligned
      if (includeSku) {
        const skuText = `SKU: ${sp.product.sku || sp.product.code || '-'}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(labelFontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(skuText, leftMargin, y + labelFontSize);
        y += labelFontSize * 1.5 + mmToPt(0.3);
      }

      // Meta row (Weight & Price) - ALL BOLD AND DARK
      const netWeightValue = sp.netWeight ? formatWeightDisplay(sp.netWeight) : '';
      const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
      const priceText = `RS ${price}`;

      if (netWeightValue || includePrice) {
        if (netWeightValue) {
          // NET WT - ALL BOLD
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(labelFontSize);
          doc.setTextColor(0, 0, 0); // Pure black
          doc.text('NET WT:', leftMargin, y + labelFontSize);

          // Weight value - ALSO BOLD
          const labelWidth = doc.getTextWidth('NET WT: ');
          doc.setFont('helvetica', 'bold'); // Changed to bold
          doc.setFontSize(valueFontSize);
          doc.setTextColor(0, 0, 0);
          doc.text(netWeightValue, leftMargin + labelWidth, y + labelFontSize);
        }

        // Price on the right side in bold
        if (includePrice) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(priceFontSize);
          doc.setTextColor(0, 0, 0);
          const priceWidth = doc.getTextWidth(priceText);
          doc.text(priceText, leftMargin + contentWidth - priceWidth, y + priceFontSize);
        }

        y += labelFontSize * 1.5 + mmToPt(0.5); // More spacing
      }

      // Dates row (PKG & EXP) - ALL BOLD AND DARK
      const pkgDate = formatDate(sp.packageDate);
      const expDate = formatDate(sp.expiryDate);
      
      // PKG label and value - ALL BOLD
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(labelFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text('PKG:', leftMargin, y + labelFontSize);
      const pkgLabelWidth = doc.getTextWidth('PKG: ');
      doc.setFont('helvetica', 'bold'); // Changed to bold
      doc.setFontSize(valueFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(pkgDate, leftMargin + pkgLabelWidth, y + labelFontSize);
      
      // EXP label and value - ALL BOLD (right side)
      const expLabel = 'EXP:';
      const expFullText = `${expLabel} ${expDate}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(labelFontSize);
      doc.setTextColor(0, 0, 0);
      const expLabelWidth = doc.getTextWidth(expLabel);
      const expFullWidth = doc.getTextWidth(expFullText);
      const expX = leftMargin + contentWidth - expFullWidth;
      doc.text(expLabel, expX, y + labelFontSize);
      doc.setFont('helvetica', 'bold'); // Changed to bold
      doc.setFontSize(valueFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(expDate, expX + expLabelWidth, y + labelFontSize);
      
      y += labelFontSize * 1.5 + mmToPt(0.3); // Less spacing - barcode will be positioned at bottom
      
      // Barcode: 9-digit numeric SKU only; legacy products use SANITIZED-PRICE until SKU is migrated
      const barcodeValue = encodeLabelBarcodeValue(
        sp.product.sku,
        sp.product.code,
        price
      );
      
      try {
        // Generate barcode - LARGER width and height, VERY DARK, with LARGER number
        const canvas = document.createElement('canvas');
        
        // Much higher resolution for better quality and darker rendering
        const barcodeHeightPx = 120; // Increased from 100 for larger barcode
        canvas.height = barcodeHeightPx;
        canvas.width = 600; // Wider canvas for better quality
        
        // Set canvas context for VERY DARK rendering
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000'; // Pure black
          ctx.strokeStyle = '#000000'; // Pure black
          ctx.lineWidth = 2; // Thicker lines for darker appearance
        }
        
        // Generate barcode with VERY DARK bars - NO number in image (we'll add large text separately)
        JsBarcode(canvas, barcodeValue, {
          format: "CODE128",
          width: 4.5, // MUCH wider bars for VERY DARK appearance
          height: barcodeHeightPx,
          displayValue: false, // NO number in barcode image - we'll add large text separately below
          margin: 10, // Quiet zones for better scanning
          background: "#FFFFFF",
          lineColor: "#000000" // Pure black - VERY DARK
        });
        
        // Ensure barcode is rendered VERY DARK
        if (ctx) {
          ctx.globalCompositeOperation = 'source-over';
          // Enhance contrast for darker appearance
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            // Make black pixels even darker (ensure pure black)
            if (data[i] < 128) { // If it's dark
              data[i] = 0;     // R
              data[i + 1] = 0; // G
              data[i + 2] = 0; // B
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
        
        const barcodeDataURL = canvas.toDataURL('image/png', 1.0);

        // Position the barcode *below the dates row* — the old code anchored
        // it from the bottom of the label, which caused it to overlap the
        // PKG/EXP text when the title wrapped or fonts grew.
        const barcodeTopGap = mmToPt(1.5); // gap between dates row and barcode
        const barcodeStartY = y + barcodeTopGap;

        // Reserve room for the barcode number text below the bars.
        const textFontSize = 9;
        const textTopGap = mmToPt(1.5);
        const reservedTextSpace = textFontSize + textTopGap + mmToPt(0.5);

        // Vertical room actually available between the dates row and the
        // bottom margin, minus the text below the barcode.
        const availableHeight =
          heightPt - marginPt - barcodeStartY - reservedTextSpace;

        // Cap width at 90% of content width.
        const targetBarcodeWidthPt = contentWidth * 0.9;

        const barcodeAspectRatio = canvas.width / canvas.height;

        // Start from the width target and derive height; if that overflows the
        // available vertical space, shrink to fit instead.
        let finalBarcodeWidthPt = targetBarcodeWidthPt;
        let finalBarcodeHeightPt = finalBarcodeWidthPt / barcodeAspectRatio;
        if (finalBarcodeHeightPt > availableHeight) {
          finalBarcodeHeightPt = Math.max(availableHeight, mmToPt(6));
          finalBarcodeWidthPt = finalBarcodeHeightPt * barcodeAspectRatio;
          if (finalBarcodeWidthPt > targetBarcodeWidthPt) {
            finalBarcodeWidthPt = targetBarcodeWidthPt;
            finalBarcodeHeightPt = finalBarcodeWidthPt / barcodeAspectRatio;
          }
        }

        const barcodeX = leftMargin + (contentWidth - finalBarcodeWidthPt) / 2;
        const barcodeY = barcodeStartY;

        doc.addImage(
          barcodeDataURL,
          'PNG',
          barcodeX,
          barcodeY,
          finalBarcodeWidthPt,
          finalBarcodeHeightPt,
        );

        // Barcode number — centered under the bars, clear gap, doesn't run
        // past the bottom margin.
        const barcodeTextY = barcodeY + finalBarcodeHeightPt + textTopGap + textFontSize;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(textFontSize);
        doc.setTextColor(0, 0, 0);
        const barcodeTextWidth = doc.getTextWidth(barcodeValue);
        const barcodeTextX = leftMargin + (contentWidth - barcodeTextWidth) / 2;
        doc.text(barcodeValue, barcodeTextX, barcodeTextY);
      } catch (err) {
        console.error('Barcode generation error:', err);
      }
    }
    
    // Generate PDF blob and open in new window for printing
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Open PDF in new window and trigger print
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    } else {
      throw new Error('Could not open print window. Please allow pop-ups.');
    }
    
    // Clean up URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(pdfUrl);
    }, 10000);
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
          ${selectedProducts.map(withPrintDefaults).map((sp) => {
            const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
            const barcodeValue = encodeLabelBarcodeValue(sp.product.sku, sp.product.code, price);
            const barcodeDataURL = generateBarcodeDataURL(barcodeValue);
            
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
        ${selectedProducts.map(withPrintDefaults).map((sp) => {
          const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
          const barcodeValue = encodeLabelBarcodeValue(sp.product.sku, sp.product.code, price);
          const barcodeDataURL = generateBarcodeDataURL(barcodeValue);
          
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
      
      setTimeout(() => {
        printWindow.close();
        setIsPrinting(false);
        toast({
          title: "Print Dialog Opened",
          description: barcodePrinter ? `Printer: ${barcodePrinter}` : "Select your printer from the dialog",
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

  const canPrint = selectedProducts.length > 0;

  // Total label count across all selected products — what the printer will
  // actually emit. Drives the print button label so the user knows how many
  // labels a batch will produce before they click.
  const totalLabels = selectedProducts.reduce(
    (sum, item) => sum + Math.max(1, item.copies || 1),
    0,
  );

  const previewItem = selectedProducts[0];
  const previewPrice = previewItem
    ? Math.round(
        Number(
          calculatePriceByWeight(
            previewItem.netWeight,
            previewItem.product.sales_rate_exc_dis_and_tax,
          ),
        ),
      )
    : 0;
  const previewBarcodeValue = previewItem
    ? encodeLabelBarcodeValue(
        previewItem.product.sku,
        previewItem.product.code,
        previewPrice,
      )
    : "000000000";
  const copiesForProduct = (productId: string) =>
    selectedProducts.find((sp) => sp.product.id === productId)?.copies;

  if (isFirstLoad) {
    return <PageLoader message="Loading Barcode Generator..." />;
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-x-hidden pb-24 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <BarcodeScanIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 shrink-0" />
            <span className="truncate">Barcode Generator</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Search a product, then print. Weight and expiry are optional.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={!canPrint}
            className="hidden sm:inline-flex"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button onClick={handlePrintAll} disabled={!canPrint || isPrinting}>
            {isPrinting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {isPrinting
              ? "Printing..."
              : `Print ${totalLabels} Label${totalLabels === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="p-3 sm:p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              {isRefreshing && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />
              )}
              <Input
                ref={productSearchInputRef}
                placeholder="Scan or search by name, SKU, or code"
                value={searchTerm}
                autoComplete="off"
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className={`pl-9 w-full h-11 ${isRefreshing ? "pr-9" : ""}`}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48 shrink-0 h-11">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canPrint && (
            <p className="text-sm text-green-700">
              {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"} selected
              {" · "}
              {totalLabels} label{totalLabels === 1 ? "" : "s"}
            </p>
          )}

          {isRefreshing && pagedProducts.length === 0 ? (
            <div className="rounded-lg border py-10 text-center text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading products...
            </div>
          ) : pagedProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-gray-500 text-sm">
              {searchTerm || categoryFilter !== "all"
                ? "No matching products found."
                : "No products available."}
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                <div className="flex items-center gap-2 px-1">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleSelectAllOnPage}
                    id="select-all-mobile"
                  />
                  <Label htmlFor="select-all-mobile" className="text-sm font-normal cursor-pointer">
                    Select all on this page
                  </Label>
                </div>
                {pagedProducts.map((product, idx) => {
                  const selected = isProductSelected(product.id);
                  const copies = copiesForProduct(product.id);
                  const stock = product.current_stock ?? product.stock ?? 0;
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => handleProductSelect(product.id, { keepSearch: true })}
                      className={`w-full text-left rounded-lg border p-3 space-y-1 transition ${
                        selected
                          ? "border-blue-300 bg-blue-50/60"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm leading-snug">
                          {(tablePage - 1) * TABLE_PAGE_SIZE + idx + 1}. {product.name}
                        </p>
                        <span className="text-sm font-bold text-green-700 shrink-0">
                          Rs {product.sales_rate_exc_dis_and_tax || 0}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        SKU: {product.sku || product.code || "—"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {product.category ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {product.category}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-gray-600">Stock: {stock}</span>
                        {selected ? (
                          <Badge className="text-[10px] bg-blue-600">
                            {copies} label{copies === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-blue-600">Tap to add</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="hidden md:block border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAllOnPage} />
                      </TableHead>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedProducts.map((product, idx) => {
                      const selected = isProductSelected(product.id);
                      const copies = copiesForProduct(product.id);
                      const stock = product.current_stock ?? product.stock ?? 0;
                      return (
                        <TableRow
                          key={product.id}
                          className={`cursor-pointer ${selected ? "bg-blue-50/50" : ""}`}
                          onClick={() => {
                            if (!selected) handleProductSelect(product.id, { keepSearch: true });
                          }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleProductRow(product)}
                            />
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {(tablePage - 1) * TABLE_PAGE_SIZE + idx + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            <span>{product.name}</span>
                            {selected ? (
                              <Badge className="ml-2 text-[10px] bg-blue-600">
                                {copies} label{copies === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-gray-600">{product.sku || product.code || "—"}</TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="secondary">{product.category}</Badge>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>Rs {product.sales_rate_exc_dis_and_tax || 0}</TableCell>
                          <TableCell>{stock}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {filteredProducts.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
              <span className="text-xs sm:text-sm text-center sm:text-left">
                Showing {(tablePage - 1) * TABLE_PAGE_SIZE + 1} to{" "}
                {Math.min(tablePage * TABLE_PAGE_SIZE, filteredProducts.length)} of{" "}
                {filteredProducts.length} products
              </span>
              <div className="flex items-center justify-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs font-medium">
                  {tablePage} / {totalTablePages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                  disabled={tablePage === totalTablePages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canPrint && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0">
          <Card className="xl:col-span-2 min-w-0 overflow-hidden">
            <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>Print queue</span>
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Clear
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {selectedProducts.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-200 p-3 space-y-2 min-w-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {item.product.sku || item.product.code || "—"} · Rs{" "}
                        {item.product.sales_rate_exc_dis_and_tax || 0}
                      </p>
                    </div>
                    <Button
                      onClick={() => removeProduct(item.id)}
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-500">Copies</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            updateProductData(item.id, "copies", Math.max(1, (item.copies || 1) - 1))
                          }
                          disabled={(item.copies || 1) <= 1}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={item.copies}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            updateProductData(
                              item.id,
                              "copies",
                              Number.isFinite(n) && n > 0 ? n : 1,
                            );
                          }}
                          className="h-8 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => updateProductData(item.id, "copies", (item.copies || 1) + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">Weight</Label>
                      <Input
                        value={item.netWeight}
                        list={`weights-${item.id}`}
                        onChange={(e) => updateProductData(item.id, "netWeight", e.target.value)}
                        placeholder="Optional"
                        className="h-8"
                      />
                      <datalist id={`weights-${item.id}`}>
                        {getNetWeightOptions(item.product.unitName)
                          .filter((opt) => opt.value !== "custom")
                          .map((opt) => (
                            <option key={opt.value} value={opt.value} />
                          ))}
                      </datalist>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="text-[11px] text-gray-500">Expiry</Label>
                      <Select
                        value={item.expiryDuration || "12"}
                        onValueChange={(value) => updateProductData(item.id, "expiryDuration", value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
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
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarcodeScanIcon className="h-5 w-5 shrink-0 text-blue-600" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 space-y-3">
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-3 flex flex-col items-center justify-center gap-1.5 min-w-0">
                {includeProductName && (
                  <p className="text-xs font-bold uppercase text-center truncate w-full">
                    {previewItem ? previewItem.product.name : "Sample Product"}
                  </p>
                )}
                {includeSku && (
                  <p className="text-[10px] text-gray-500 truncate max-w-full">
                    SKU: {previewItem ? previewItem.product.sku || previewItem.product.code || "—" : "SAMPLE"}
                  </p>
                )}
                <img
                  src={generateBarcodeDataURL(previewBarcodeValue)}
                  alt="Barcode preview"
                  className="h-14 max-w-full object-contain"
                />
                <p className="text-xs font-mono text-gray-600 break-all text-center">{previewBarcodeValue}</p>
                {includePrice && (
                  <p className="text-sm font-bold text-blue-600">Rs {previewItem ? previewPrice : 0}</p>
                )}
              </div>
              <Button onClick={handlePrintAll} className="w-full" disabled={!canPrint || isPrinting}>
                {isPrinting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 mr-2" />
                )}
                {isPrinting
                  ? "Printing..."
                  : `Print ${totalLabels} Label${totalLabels === 1 ? "" : "s"}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowMoreOptions((open) => !open)}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          {showMoreOptions ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          More options
        </button>

        {showMoreOptions && (
          <Card className="mt-3 min-w-0 overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Barcode printer</Label>
                {barcodePrinter ? (
                  <div className="px-3 py-2 rounded-lg border border-purple-100 bg-purple-50/60 flex flex-wrap items-center gap-2 text-sm text-purple-800">
                    <span className="font-medium break-all">{barcodePrinter}</span>
                    <span className="text-purple-600 text-xs">(change in Printer Settings)</span>
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg border border-amber-100 bg-amber-50 text-sm text-amber-800">
                    No barcode printer configured. Set one in <strong>Printer Settings</strong>.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Label size</Label>
                  <Select value={selectedPaperSize} onValueChange={setSelectedPaperSize}>
                    <SelectTrigger>
                      <SelectValue />
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
                <div>
                  <Label className="text-xs text-gray-600">Default expiry</Label>
                  <Select value={globalExpiryDuration} onValueChange={setGlobalExpiryDuration}>
                    <SelectTrigger>
                      <SelectValue />
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
                <div>
                  <Label htmlFor="global-net-weight" className="text-xs text-gray-600">
                    Default weight
                  </Label>
                  <Input
                    id="global-net-weight"
                    value={globalNetWeight}
                    onChange={(e) => setGlobalNetWeight(e.target.value)}
                    placeholder="e.g. 500g"
                  />
                </div>
                <div>
                  <Label htmlFor="global-copies" className="text-xs text-gray-600">
                    Default copies
                  </Label>
                  <Input
                    id="global-copies"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={globalCopies}
                    onChange={(e) => setGlobalCopies(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-900">Show on label</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <Label htmlFor="include-name" className="text-sm font-normal cursor-pointer">
                      Product name
                    </Label>
                    <Switch id="include-name" checked={includeProductName} onCheckedChange={setIncludeProductName} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <Label htmlFor="include-price" className="text-sm font-normal cursor-pointer">
                      Price
                    </Label>
                    <Switch id="include-price" checked={includePrice} onCheckedChange={setIncludePrice} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <Label htmlFor="include-sku" className="text-sm font-normal cursor-pointer">
                      SKU
                    </Label>
                    <Switch id="include-sku" checked={includeSku} onCheckedChange={setIncludeSku} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Bulk upload</p>
                  <p className="text-xs text-gray-500 mt-1">
                    CSV or Excel with SKU, plus optional Net Weight, Expiry Months, and Copies.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={downloadBulkTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download template
                  </Button>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => bulkFileInputRef.current?.click()}
                    disabled={bulkParsing}
                  >
                    {bulkParsing ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {bulkParsing ? "Processing..." : "Choose file"}
                  </Button>
                </div>
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleBulkFileChange}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {canPrint && (
        <div className="fixed bottom-0 inset-x-0 z-30 md:hidden border-t bg-white/95 backdrop-blur p-3">
          <Button onClick={handlePrintAll} className="w-full h-11" disabled={isPrinting}>
            {isPrinting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {isPrinting
              ? "Printing..."
              : `Print ${totalLabels} Label${totalLabels === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
