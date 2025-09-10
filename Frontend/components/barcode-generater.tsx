"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ZebraBrowserPrintWrapper from "zebra-browser-print-wrapper";
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
  Settings,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { PageLoader } from "./ui/page-loader";
import { usePosData } from "@/hooks/use-pos-data";
import { useToast } from "@/hooks/use-toast";

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
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

  const checkPrinterConnection = async () => {
    try {
      const browserPrint = new ZebraBrowserPrintWrapper();
      console.log("🚀 ~ checkPrinterConnection ~ browserPrint:", browserPrint)
      const isConnected = await browserPrint.getDefaultPrinter();
      console.log("🚀 ~ checkPrinterConnection ~ isConnected:", isConnected)
      if (isConnected) {
        console.log("Printer connected successfully");
        return browserPrint;
      }
      return null;
    } catch (error) {
      console.error("Printer connection failed:", error);
      toast({
        variant: "destructive",
        title: "Printer Connection Error",
        description: "Please ensure:\n1. Zebra Browser Print is installed\n2. The service is running\n3. Your printer is connected and powered on",
      });
      return null;
    }
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

    try {
      // Check printer connection first
      const browserPrint = await checkPrinterConnection();
      if (!browserPrint) {
        return;
      }

      // Select default printer
      const defaultPrinter = await browserPrint.getDefaultPrinter();
      
      // Set the printer
      browserPrint.setPrinter(defaultPrinter);

      // Check printer status
      const printerStatus = await browserPrint.checkPrinterStatus();

      if (!printerStatus.isReadyToPrint) {
        toast({
          variant: "destructive",
          title: "Printer Error",
          description: `Printer is not ready: ${Array.isArray(printerStatus.errors) ? printerStatus.errors.join(", ") : printerStatus.errors}`,
        });
        return;
      }

    // Prepare ZPL commands for all labels
    let allZplCommands = "";

    selectedProducts.forEach((item) => {
      const name = (item.product.name || "").toUpperCase();
      const weight = formatWeightDisplay(item.netWeight);
      const price = Math.round(
        Number(
          calculatePriceByWeight(
            item.netWeight,
            item.product.sales_rate_exc_dis_and_tax
          )
        )
      );
      const pkg = formatDate(item.packageDate);
      const exp = formatDate(item.expiryDate);
      const barcodeValue = `${
        item.product.sku || item.product.code || "PROD"
      }-${price}`;

      // Generate ZPL commands for this label
      const zpl = `^XA
^CF0,30
^FO50,50^FB400,2,0,C^FD${name}^FS
^FO50,120^FD${weight}^FS
^FO250,120^FDRs ${price}^FS
^BY3,2,100
^FO50,150^BC^FD${barcodeValue}^FS
^FO50,280^FDPkg: ${pkg}^FS
^FO250,280^FDExp: ${exp}^FS
^XZ`;

      allZplCommands += zpl;
    });

      // Print all labels using Zebra printer
      await browserPrint.print(allZplCommands);

      toast({
        title: "Print Success",
        description: `Successfully sent ${selectedProducts.length} labels to printer.`,
      });
    } catch (error) {
      console.error('Printing error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to print labels. Please check printer connection.";
      toast({
        variant: "destructive",
        title: "Print Error",
        description: errorMessage,
      });
    }
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
                disabled={!isFormValid}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print All Barcodes ({selectedProducts.length})
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
