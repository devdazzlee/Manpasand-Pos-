"use client";

import { useState, useRef, useEffect, useMemo } from "react";
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
import { Printer, Package, Search, Loader2, RefreshCw, X, Plus, Trash2 } from "lucide-react";
import Barcode from "react-barcode";
import { DatePicker } from "./ui/date-picker";
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
  packageDate?: Date;
  expiryDate?: Date;
}

export default function BarcodeGenerator() {
  const [selectedProducts, setSelectedProducts] = useState<SelectedProductItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentProductId, setCurrentProductId] = useState("");
  const [globalPackageDate, setGlobalPackageDate] = useState<Date>();
  const [globalExpiryDate, setGlobalExpiryDate] = useState<Date>();
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Global store with custom hook
  const {
    products,
    productsLoading,
    isAnyLoading,
    refreshAllData,
    fetchProducts,
  } = usePosData();

  useEffect(() => {
    const fetchData = async () => {
      try {
        await fetchProducts();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to load data",
          description: "Could not fetch products from server",
        });
      }
    };
    fetchData();
  }, [fetchProducts, toast]);

  const parseWeightToGrams = (weightInput: any) => {
    if (!weightInput || weightInput.trim() === "") return 0;

    const input = weightInput.toLowerCase().trim();
    let weight = 0;

    // Extract number from input
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return 0;

    const number = Number.parseFloat(numberMatch[1]);

    // Convert to grams based on unit
    if (input.includes("kg")) {
      weight = number * 1000; // Convert kg to grams
    } else if (input.includes("g") && !input.includes("kg")) {
      weight = number; // Already in grams
    } else if (input.includes("ml") || input.includes("l")) {
      // For liquids, assume 1ml = 1g, 1l = 1000g
      if (input.includes("ml")) {
        weight = number;
      } else if (input.includes("l")) {
        weight = number * 1000;
      }
    } else {
      // No unit specified, assume grams
      weight = number;
    }

    return weight;
  };

  const calculatePriceByWeight = (netWeightInput: any, basePrice: any) => {
    if (!netWeightInput || !basePrice) return basePrice || 0;

    const input = netWeightInput.toLowerCase().trim();

    // Extract number (including decimals)
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return basePrice;

    const weightValue = Number.parseFloat(numberMatch[1]);
    if (weightValue <= 0) return basePrice;

    let multiplier = 1; // Default multiplier (1kg = base price)

    // WEIGHT UNITS (convert everything to kg equivalent)
    if (input.includes("kg") || input.includes("kilo")) {
      multiplier = weightValue; // 1kg = 1x base price
    } else if (
      input.includes("g") &&
      !input.includes("kg") &&
      !input.includes("mg")
    ) {
      multiplier = weightValue / 1000; // 1000g = 1kg
    } else if (input.includes("mg")) {
      multiplier = weightValue / 1000000; // 1,000,000mg = 1kg
    } else if (input.includes("lb") || input.includes("pound")) {
      multiplier = weightValue * 0.453592; // 1lb = 0.453592kg
    } else if (input.includes("oz") && !input.includes("fl")) {
      multiplier = weightValue * 0.0283495; // 1oz = 0.0283495kg
    } else if (input.includes("ton") || input.includes("tonne")) {
      multiplier = weightValue * 1000; // 1 ton = 1000kg
    }

    // VOLUME UNITS (treat 1L = 1kg for liquids)
    else if (
      input.includes("l") &&
      !input.includes("ml") &&
      !input.includes("fl")
    ) {
      multiplier = weightValue; // 1L = 1kg (water density)
    } else if (input.includes("ml") || input.includes("milliliter")) {
      multiplier = weightValue / 1000; // 1000ml = 1L = 1kg
    } else if (input.includes("fl oz") || input.includes("fluid ounce")) {
      multiplier = weightValue * 0.0295735; // 1 fl oz = 29.5735ml
    } else if (input.includes("cup")) {
      multiplier = weightValue * 0.236588; // 1 cup = 236.588ml
    } else if (input.includes("pint")) {
      multiplier = weightValue * 0.473176; // 1 pint = 473.176ml
    } else if (input.includes("quart")) {
      multiplier = weightValue * 0.946353; // 1 quart = 946.353ml
    } else if (input.includes("gallon")) {
      multiplier = weightValue * 3.78541; // 1 gallon = 3.78541L
    }

    // PAKISTANI/INDIAN UNITS
    else if (input.includes("ser") || input.includes("seer")) {
      multiplier = weightValue * 0.933105; // 1 seer = 933.105g
    } else if (input.includes("maund")) {
      multiplier = weightValue * 37.3242; // 1 maund = 37.3242kg
    } else if (input.includes("tola")) {
      multiplier = weightValue * 0.01166; // 1 tola = 11.66g
    }

    // PIECE/COUNT UNITS
    else if (
      input.includes("pc") ||
      input.includes("piece") ||
      input.includes("pcs")
    ) {
      multiplier = weightValue; // 1 piece = base price
    } else if (input.includes("dozen")) {
      multiplier = weightValue * 12; // 1 dozen = 12 pieces
    } else if (input.includes("pack") || input.includes("packet")) {
      multiplier = weightValue; // 1 pack = base price
    }

    // DEFAULT: If no unit specified, assume grams
    else {
      multiplier = weightValue / 1000; // Assume grams if no unit
    }

    const finalPrice = basePrice * multiplier;
    return finalPrice.toFixed(2);
  };

  // Format display function for better readability
  const formatWeightDisplay = (netWeightInput: any) => {
    if (!netWeightInput) return "Not specified";

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return netWeightInput;

    const number = Number.parseFloat(numberMatch[1]);

    // Return formatted with proper unit
    if (input.includes("kg")) return `${number}kg`;
    if (input.includes("g") && !input.includes("kg") && !input.includes("mg"))
      return `${number}g`;
    if (input.includes("mg")) return `${number}mg`;
    if (input.includes("lb")) return `${number}lb`;
    if (input.includes("oz") && !input.includes("fl")) return `${number}oz`;
    if (input.includes("l") && !input.includes("ml")) return `${number}L`;
    if (input.includes("ml")) return `${number}ml`;
    if (input.includes("fl oz")) return `${number}fl oz`;
    if (input.includes("cup")) return `${number} cup${number > 1 ? "s" : ""}`;
    if (input.includes("pint")) return `${number} pint${number > 1 ? "s" : ""}`;
    if (input.includes("ser")) return `${number} seer`;
    if (input.includes("maund")) return `${number} maund`;
    if (input.includes("tola")) return `${number} tola`;
    if (input.includes("pc") || input.includes("piece")) return `${number} pcs`;
    if (input.includes("dozen")) return `${number} dozen`;

    // Default: assume grams
    return `${number}g`;
  };

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku &&
          product.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [products, searchTerm]);

  // Add product to selected list
  const addProduct = () => {
    if (!currentProductId) return;
    
    const product = products.find((p) => p.id === currentProductId);
    if (!product) return;

    // Check if product already selected
    if (selectedProducts.some(sp => sp.product.id === currentProductId)) {
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
      packageDate: globalPackageDate,
      expiryDate: globalExpiryDate,
    };

    setSelectedProducts(prev => [...prev, newItem]);
    setCurrentProductId("");
  };

  // Remove product from selected list
  const removeProduct = (itemId: string) => {
    setSelectedProducts(prev => prev.filter(item => item.id !== itemId));
  };

  // Update individual product data
  const updateProductData = (itemId: string, field: keyof SelectedProductItem, value: any) => {
    setSelectedProducts(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  // Apply global dates to all products
  const applyGlobalDates = () => {
    setSelectedProducts(prev => 
      prev.map(item => ({
        ...item,
        packageDate: globalPackageDate,
        expiryDate: globalExpiryDate,
      }))
    );
    toast({
      title: "Dates applied",
      description: "Global dates have been applied to all products.",
    });
  };

  // Clear all selected products
  const clearAll = () => {
    setSelectedProducts([]);
    toast({
      title: "Cleared",
      description: "All products have been removed from the list.",
    });
  };

  const handlePrintAll = () => {
    if (selectedProducts.length === 0) return;

    // Validate all products have required data
    const invalidProducts = selectedProducts.filter(item => 
      !item.netWeight.trim() || !item.packageDate || !item.expiryDate
    );

    if (invalidProducts.length > 0) {
      toast({
        variant: "destructive",
        title: "Incomplete data",
        description: `${invalidProducts.length} products are missing required information.`,
      });
      return;
    }

    const w = window.open("", "_blank", "width=660,height=520");
    if (!w) return;

    // Generate HTML for all products
    let allLabelsHTML = "";
    
    selectedProducts.forEach((item) => {
      const name = (item.product.name || "").toUpperCase();
      const weight = formatWeightDisplay(item.netWeight);
      const price = Math.round(
        calculatePriceByWeight(
          item.netWeight,
          item.product.sales_rate_exc_dis_and_tax
        )
      );
      const pkg = formatDate(item.packageDate);
      const exp = formatDate(item.expiryDate);

      // Create barcode SVG for this product
      const barcodeValue = `${item.product.sku}-${price}`;
      const barcodeSVG = `<svg width="41mm" height="var(--bc-h)" viewBox="0 0 165 60" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <g transform="translate(10,10)">
          ${generateBarcodeRects(barcodeValue)}
        </g>
      </svg>`;

      allLabelsHTML += `
        <div class="label" style="page-break-after: always;">
          <div class="title">${name}</div>
          <div class="row"><span>Net Wt: ${weight}</span><span>Price: ${price}</span></div>
          <div class="bc">${barcodeSVG}</div>
          <div class="dates"><span>PKG: ${pkg}</span><span>EXP: ${exp}</span></div>
        </div>
      `;
    });

    w.document.write(`
  <html>
    <head>
      <title>Barcode Labels - Batch Print</title>
      <style>
        @page { size: 50mm 30mm; margin: 0; }
        html,body{ margin:0; padding:0; overflow:hidden; }

        :root{
          --fs-title: 11.5pt;
          --fs-body:   9.5pt;
          --fs-small:  8.0pt;
          --bc-h:     11.0mm;
        }

        .label{
          width:50mm; height:30mm; box-sizing:border-box;
          padding:0.8mm 3mm;
          display:grid;
          grid-template-rows: auto auto 1fr auto;
          gap:.4mm; font-family: Arial, sans-serif;
        }

        .title{
          font:700 var(--fs-title)/1.05 Arial; text-align:center; text-transform:uppercase;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
          word-break: break-word; hyphens: auto; word-wrap: break-word;
          max-height: 8mm;
        }

        .row{ 
          display:flex; justify-content:space-between; gap:1mm; white-space:nowrap;
          font:700 var(--fs-body)/1.05 Arial;
        }

        .bc{ 
          display:flex; align-items:center; justify-content:center; 
          min-height:8mm;
        }
        .bc svg{ width:41mm; height:var(--bc-h); display:block; }

        .dates{
          display:flex; justify-content:space-between; gap:1mm; white-space:nowrap;
          font:700 var(--fs-small)/1.05 Arial; border-top:.22mm solid #000; padding-top:.45mm;
        }
      </style>
    </head>
    <body>
      ${allLabelsHTML}

      <script>
        const root = document.documentElement;
        const labels = document.querySelectorAll('.label');

        function shrink(varName, step, min, unit){
          const v = parseFloat(getComputedStyle(root).getPropertyValue(varName));
          if (v <= min) return false;
          root.style.setProperty(varName, (v - step) + unit);
          return true;
        }

        function fitTitleText(label) {
          const title = label.querySelector('.title');
          let guard = 40;
          
          while (title.scrollHeight > title.clientHeight && guard-- > 0) {
            if (!shrink('--fs-title', 0.6, 6.5, 'pt')) break;
          }
        }

        function fitRowWidth(label, selector, varName, minPt){
          const row = label.querySelector(selector);
          const spans = row.querySelectorAll('span');
          const gap = parseFloat(getComputedStyle(row).gap) || 0;
          const rowW = () => row.getBoundingClientRect().width;
          const sumW = () => spans[0].getBoundingClientRect().width + spans[1].getBoundingClientRect().width + gap;
          let guard = 30;
          while (sumW() > rowW() && guard-- > 0){
            if (!shrink(varName, 0.5, minPt, 'pt')) break;
          }
        }

        function fitHeight(label){
          let guard = 40;
          
          while (label.scrollHeight > label.clientHeight && guard-- > 0){
            if (shrink('--fs-title', 0.5, 6.0, 'pt')) continue;
            if (shrink('--bc-h',     0.4, 7.0, 'mm')) continue;
            if (shrink('--fs-body',  0.4, 7.0, 'pt')) continue;
            if (shrink('--fs-small', 0.3, 6.0, 'pt')) continue;
            break;
          }
        }

        // Process each label
        labels.forEach(label => {
          fitTitleText(label);
          fitRowWidth(label, '.row', '--fs-body', 7.0);
          fitRowWidth(label, '.dates', '--fs-small', 6.0);
          fitHeight(label);
        });

        window.print(); 
        setTimeout(()=>window.close(), 200);
      </script>
    </body>
  </html>`);
    w.document.close();
  };

  // Simple barcode rect generator (placeholder - you'd want to use a proper barcode library)
  const generateBarcodeRects = (value: string) => {
    // This is a simplified barcode generator
    // In a real implementation, you'd use proper Code128 encoding
    let rects = "";
    for (let i = 0; i < value.length * 6; i++) {
      const x = i * 2;
      const width = (i % 3 === 0) ? 3 : 1;
      rects += `<rect x="${x}" y="0" width="${width}" height="40" fill="black"/>`;
    }
    return rects;
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "__/__/____";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const isFormValid = selectedProducts.length > 0 && 
    selectedProducts.every(item => 
      item.netWeight.trim() && item.packageDate && item.expiryDate
    );

  if (productsLoading && products.length === 0) {
    return <PageLoader message="Barcode Generator..." />;
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
            <div className="space-y-2">
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
                            SKU: {product.sku} | Rs {product.sales_rate_exc_dis_and_tax}
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
              <Label>Global Dates (Apply to All)</Label>
              <div className="grid grid-cols-1 gap-2">
                <DatePicker
                  date={globalPackageDate}
                  onDateChange={setGlobalPackageDate}
                  placeholder="Global package date"
                />
                <DatePicker
                  date={globalExpiryDate}
                  onDateChange={setGlobalExpiryDate}
                  placeholder="Global expiry date"
                />
                <Button
                  onClick={applyGlobalDates}
                  variant="outline"
                  size="sm"
                  disabled={!globalPackageDate || !globalExpiryDate || selectedProducts.length === 0}
                >
                  Apply to All Products
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
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
                  <div key={item.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{item.product.name}</h3>
                        <p className="text-sm text-gray-600">SKU: {item.product.sku}</p>
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
                        <Label htmlFor={`weight-${item.id}`}>Net Weight *</Label>
                        <Input
                          id={`weight-${item.id}`}
                          value={item.netWeight}
                          onChange={(e) => updateProductData(item.id, 'netWeight', e.target.value)}
                          placeholder="e.g., 500g, 1kg"
                        />
                      </div>
                      <div>
                        <Label>Package Date *</Label>
                        <DatePicker
                          date={item.packageDate}
                          onDateChange={(date) => updateProductData(item.id, 'packageDate', date)}
                          placeholder="Package date"
                        />
                      </div>
                      <div>
                        <Label>Expiry Date *</Label>
                        <DatePicker
                          date={item.expiryDate}
                          onDateChange={(date) => updateProductData(item.id, 'expiryDate', date)}
                          placeholder="Expiry date"
                        />
                      </div>
                    </div>

                    {/* Individual Preview */}
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs text-center space-y-1">
                        <div className="font-bold">{item.product.name.toUpperCase()}</div>
                        <div>Net Wt: {formatWeightDisplay(item.netWeight)} | Price: Rs {Math.round(calculatePriceByWeight(item.netWeight, item.product.sales_rate_exc_dis_and_tax))}</div>
                        <div className="flex justify-center">
                          <Barcode
                            value={`${item.product.sku}-${Math.round(calculatePriceByWeight(item.netWeight, item.product.sales_rate_exc_dis_and_tax))}`}
                            format="CODE128"
                            displayValue={false}
                            width={1}
                            height={30}
                            margin={0}
                          />
                        </div>
                        <div className="flex justify-between border-t pt-1">
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