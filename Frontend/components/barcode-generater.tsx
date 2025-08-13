"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Printer, Package, Search, Loader2, RefreshCw, X } from "lucide-react"
import { DatePicker } from "./ui/date-picker"
import { PageLoader } from "./ui/page-loader"
import { usePosData } from "@/hooks/use-pos-data"
import { useToast } from "@/hooks/use-toast"

interface Product {
  id: string
  code?: string
  name: string
  sku?: string
  barcode?: string
  sales_rate_exc_dis_and_tax?: number
  unitName?: string
  category?: string
  brandName?: string
  weight?: string
  mfgDate?: string
  expDate?: string
}

interface SelectedProductData {
  product: Product
  netWeight: string
  packageDate?: Date
  expiryDate?: Date
}

export default function BarcodeGenerator() {
  const [selectedProducts, setSelectedProducts] = useState<SelectedProductData[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const printRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Global store with custom hook
  const { products, productsLoading, isAnyLoading, refreshAllData, fetchProducts } = usePosData()

  useEffect(() => {
    const fetchData = async () => {
      try {
        await fetchProducts()
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to load data",
          description: "Could not fetch products from server",
        })
      }
    }
    fetchData()
  }, [fetchProducts, toast])

  const parseWeightToGrams = (weightInput: any) => {
    if (!weightInput || weightInput.trim() === "") return 0

    const input = weightInput.toLowerCase().trim()
    let weight = 0

    // Extract number from input
    const numberMatch = input.match(/(\d+\.?\d*)/)
    if (!numberMatch) return 0

    const number = Number.parseFloat(numberMatch[1])

    // Convert to grams based on unit
    if (input.includes("kg")) {
      weight = number * 1000 // Convert kg to grams
    } else if (input.includes("g") && !input.includes("kg")) {
      weight = number // Already in grams
    } else if (input.includes("ml") || input.includes("l")) {
      // For liquids, assume 1ml = 1g, 1l = 1000g
      if (input.includes("ml")) {
        weight = number
      } else if (input.includes("l")) {
        weight = number * 1000
      }
    } else {
      // No unit specified, assume grams
      weight = number
    }

    return weight
  }

  const calculatePriceByWeight = (netWeightInput: any, basePrice: any) => {
    if (!netWeightInput || !basePrice) return basePrice || 0

    const input = netWeightInput.toLowerCase().trim()

    // Extract number (including decimals)
    const numberMatch = input.match(/(\d+\.?\d*)/)
    if (!numberMatch) return basePrice

    const weightValue = Number.parseFloat(numberMatch[1])
    if (weightValue <= 0) return basePrice

    let multiplier = 1 // Default multiplier (1kg = base price)

    // WEIGHT UNITS (convert everything to kg equivalent)
    if (input.includes("kg") || input.includes("kilo")) {
      multiplier = weightValue // 1kg = 1x base price
    } else if (input.includes("g") && !input.includes("kg") && !input.includes("mg")) {
      multiplier = weightValue / 1000 // 1000g = 1kg
    } else if (input.includes("mg")) {
      multiplier = weightValue / 1000000 // 1,000,000mg = 1kg
    } else if (input.includes("lb") || input.includes("pound")) {
      multiplier = weightValue * 0.453592 // 1lb = 0.453592kg
    } else if (input.includes("oz") && !input.includes("fl")) {
      multiplier = weightValue * 0.0283495 // 1oz = 0.0283495kg
    } else if (input.includes("ton") || input.includes("tonne")) {
      multiplier = weightValue * 1000 // 1 ton = 1000kg
    }

    // VOLUME UNITS (treat 1L = 1kg for liquids)
    else if (input.includes("l") && !input.includes("ml") && !input.includes("fl")) {
      multiplier = weightValue // 1L = 1kg (water density)
    } else if (input.includes("ml") || input.includes("milliliter")) {
      multiplier = weightValue / 1000 // 1000ml = 1L = 1kg
    } else if (input.includes("fl oz") || input.includes("fluid ounce")) {
      multiplier = weightValue * 0.0295735 // 1 fl oz = 29.5735ml
    } else if (input.includes("cup")) {
      multiplier = weightValue * 0.236588 // 1 cup = 236.588ml
    } else if (input.includes("pint")) {
      multiplier = weightValue * 0.473176 // 1 pint = 473.176ml
    } else if (input.includes("quart")) {
      multiplier = weightValue * 0.946353 // 1 quart = 946.353ml
    } else if (input.includes("gallon")) {
      multiplier = weightValue * 3.78541 // 1 gallon = 3.78541L
    }

    // PAKISTANI/INDIAN UNITS
    else if (input.includes("ser") || input.includes("seer")) {
      multiplier = weightValue * 0.933105 // 1 seer = 933.105g
    } else if (input.includes("maund")) {
      multiplier = weightValue * 37.3242 // 1 maund = 37.3242kg
    } else if (input.includes("tola")) {
      multiplier = weightValue * 0.01166 // 1 tola = 11.66g
    }

    // PIECE/COUNT UNITS
    else if (input.includes("pc") || input.includes("piece") || input.includes("pcs")) {
      multiplier = weightValue // 1 piece = base price
    } else if (input.includes("dozen")) {
      multiplier = weightValue * 12 // 1 dozen = 12 pieces
    } else if (input.includes("pack") || input.includes("packet")) {
      multiplier = weightValue // 1 pack = base price
    }

    // DEFAULT: If no unit specified, assume grams
    else {
      multiplier = weightValue / 1000 // Assume grams if no unit
    }

    const finalPrice = basePrice * multiplier
    return finalPrice.toFixed(2)
  }

  // Format display function for better readability
  const formatWeightDisplay = (netWeightInput: any) => {
    if (!netWeightInput) return "Not specified"

    const input = netWeightInput.toLowerCase().trim()
    const numberMatch = input.match(/(\d+\.?\d*)/)
    if (!numberMatch) return netWeightInput

    const number = Number.parseFloat(numberMatch[1])

    // Return formatted with proper unit
    if (input.includes("kg")) return `${number}kg`
    if (input.includes("g") && !input.includes("kg") && !input.includes("mg")) return `${number}g`
    if (input.includes("mg")) return `${number}mg`
    if (input.includes("lb")) return `${number}lb`
    if (input.includes("oz") && !input.includes("fl")) return `${number}oz`
    if (input.includes("l") && !input.includes("ml")) return `${number}L`
    if (input.includes("ml")) return `${number}ml`
    if (input.includes("fl oz")) return `${number}fl oz`
    if (input.includes("cup")) return `${number} cup${number > 1 ? "s" : ""}`
    if (input.includes("pint")) return `${number} pint${number > 1 ? "s" : ""}`
    if (input.includes("ser")) return `${number} seer`
    if (input.includes("maund")) return `${number} maund`
    if (input.includes("tola")) return `${number} tola`
    if (input.includes("pc") || input.includes("piece")) return `${number} pcs`
    if (input.includes("dozen")) return `${number} dozen`

    // Default: assume grams
    return `${number}g`
  }

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())),
    )
  }, [products, searchTerm])

  const handleProductToggle = (product: Product, checked: boolean) => {
    if (checked) {
      // Add product with default values
      setSelectedProducts((prev) => [
        ...prev,
        {
          product,
          netWeight: "",
          packageDate: undefined,
          expiryDate: undefined,
        },
      ])
    } else {
      // Remove product
      setSelectedProducts((prev) => prev.filter((item) => item.product.id !== product.id))
    }
  }

  const updateSelectedProduct = (productId: string, field: keyof SelectedProductData, value: any) => {
    setSelectedProducts((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, [field]: value } : item)),
    )
  }

  const removeSelectedProduct = (productId: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const isProductSelected = (productId: string) => {
    return selectedProducts.some((item) => item.product.id === productId)
  }

  const handlePrintAll = () => {
    if (selectedProducts.length === 0) return

    // Generate HTML for all labels
    const labelsHTML = selectedProducts
      .map(({ product, netWeight, packageDate, expiryDate }) => {
        const name = (product.name || "").toUpperCase()
        const weight = formatWeightDisplay(netWeight)
        const price = Math.round(calculatePriceByWeight(netWeight, product.sales_rate_exc_dis_and_tax))
        const pkg = formatDate(packageDate)
        const exp = formatDate(expiryDate)

        // Generate barcode value
        const barcodeValue = `${product.sku}-${price}`

        return `
        <div class="label" id="label-${product.id}">
          <div class="title">${name}</div>
          <div class="row"><span>Net Wt: ${weight}</span><span>Price: ${price}</span></div>
          <div class="bc">
            <svg width="41.5mm" viewBox="0 0 ${barcodeValue.length * 11 + 20} 100" xmlns="http://www.w3.org/2000/svg">
              ${generateBarcodeStripes(barcodeValue)}
            </svg>
          </div>
          <div class="dates"><span>PKG: ${pkg}</span><span>EXP: ${exp}</span></div>
        </div>
      `
      })
      .join("")

    const w = window.open("", "_blank", "width=660,height=520")
    if (!w) return

    w.document.write(`
  <html>
    <head>
      <title>Multiple Barcodes</title>
      <style>
        @page { size: 50mm 30mm; margin: 0; }
        html, body { margin:0; padding:0; }

        :root{
          --fs-title: 12pt;
          --fs-body:   9.8pt;
          --fs-small:  8.2pt;
          --bc-h:     12mm;
        }

        .label{
          width:50mm; height:30mm; box-sizing:border-box;
          padding: 1mm 3mm;
          display:grid;
          grid-template-rows: auto auto 1fr auto;
          gap:.45mm; font-family: Arial, sans-serif;
          page-break-after: always;
        }

        .label:last-child {
          page-break-after: avoid;
        }

        .title{
          font:700 var(--fs-title)/1.05 Arial;
          text-align:center; text-transform:uppercase;
          word-break: break-word;
        }

        .row,.dates{
          display:flex; justify-content:space-between; align-items:flex-end;
          gap: 1mm; white-space:nowrap;
        }
        .row   { font:700 var(--fs-body)/1.05 Arial; }
        .dates { font:700 var(--fs-small)/1.05 Arial;
                 border-top:.22mm solid #000; padding-top:.5mm; }

        .bc{ display:flex; align-items:center; justify-content:center; }
        .bc svg{ height: var(--bc-h); width:41.5mm; display:block; }
      </style>
    </head>
    <body>
      ${labelsHTML}

      <script>
        const root = document.documentElement;
        const pxPerMM = 96/25.4;

        function shrinkVar(varName, step, minVal, unit){
          const v = parseFloat(getComputedStyle(root).getPropertyValue(varName));
          if (v <= minVal) return false;
          root.style.setProperty(varName, (v - step) + unit);
          return true;
        }

        function fitTitle(maxTitleMM, labelId){
          const ttl = document.querySelector('#' + labelId + ' .title');
          if (!ttl) return;
          let guard = 20;
          while (ttl.getBoundingClientRect().height > maxTitleMM*pxPerMM && guard-- > 0){
            if (!shrinkVar('--fs-title', 0.5, 9.0, 'pt')) break;
          }
        }

        function fitRowWidth(labelId, className, varName, minPt){
          const row = document.querySelector('#' + labelId + ' .' + className);
          if (!row) return;
          const spans = row.querySelectorAll('span');
          if (spans.length < 2) return;
          const w0 = () => spans[0].getBoundingClientRect().width;
          const w1 = () => spans[1].getBoundingClientRect().width;
          const gap = parseFloat(getComputedStyle(row).gap) || 0;
          const rw  = () => row.getBoundingClientRect().width;

          let guard = 20;
          while ((w0() + w1() + gap) > rw() && guard-- > 0){
            if (!shrinkVar(varName, 0.5, minPt, 'pt')) break;
          }
        }

        function fitHeight(labelId){
          const box = document.getElementById(labelId);
          if (!box) return;
          let guard = 18;
          while (box.scrollHeight > box.clientHeight && guard-- > 0){
            if (shrinkVar('--bc-h',     0.5, 9.5, 'mm')) continue;
            if (shrinkVar('--fs-small', 0.3, 7.2, 'pt')) continue;
            if (shrinkVar('--fs-body',  0.5, 8.2, 'pt')) continue;
            if (shrinkVar('--fs-title', 0.5, 9.0, 'pt')) continue;
            break;
          }
        }

        window.onload = () => {
          // Apply fitting to each label
          ${selectedProducts
            .map(
              ({ product }) => `
            fitTitle(9.5, 'label-${product.id}');
            fitRowWidth('label-${product.id}', 'row', '--fs-body', 8.2);
            fitRowWidth('label-${product.id}', 'dates', '--fs-small', 7.2);
            fitHeight('label-${product.id}');
          `,
            )
            .join("")}
          
          print(); 
          setTimeout(()=>close(), 300);
        };
      </script>
    </body>
  </html>`)
    w.document.close()
  }

  // Simple barcode stripe generator for CODE128 (basic implementation)
  const generateBarcodeStripes = (value: string) => {
    const stripes = []
    let x = 10

    // Simple pattern generation (this is a basic implementation)
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i)
      const pattern = char % 4 // Simple pattern based on character

      for (let j = 0; j < 4; j++) {
        const width = pattern === j ? 3 : 1
        const color = j % 2 === 0 ? "#000" : "#fff"
        if (color === "#000") {
          stripes.push(`<rect x="${x}" y="10" width="${width}" height="80" fill="${color}"/>`)
        }
        x += width
      }
    }

    return stripes.join("")
  }

  const formatDate = (date: Date | undefined) => {
    if (!date) return "__/__/____"
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const isFormValid =
    selectedProducts.length > 0 &&
    selectedProducts.every((item) => item.netWeight.trim() && item.packageDate && item.expiryDate)

  if (productsLoading && products.length === 0) {
    return <PageLoader message="Barcode Generator..." />
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Product Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Select Products ({selectedProducts.length} selected)
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

            {/* Product List with Checkboxes */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  {searchTerm ? "No products found matching your search." : "No products available."}
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`border rounded-lg p-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                      isProductSelected(product.id) ? "border-blue-500 bg-blue-50" : ""
                    }`}
                    onClick={() => handleProductToggle(product, !isProductSelected(product.id))}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isProductSelected(product.id)}
                        onCheckedChange={(checked) => handleProductToggle(product, checked as boolean)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="text-xs text-gray-600">SKU: {product.sku}</div>
                        <div className="text-xs text-gray-600">Price: Rs {product.sales_rate_exc_dis_and_tax}</div>
                        <div className="text-xs text-gray-600">
                          {product.brandName || "N/A"} | {product.unitName || "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" size="sm" onClick={refreshAllData} disabled={isAnyLoading}>
                {isAnyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>

              <Button onClick={handlePrintAll} disabled={!isFormValid} className="flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Print All Barcodes ({selectedProducts.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Selected Products Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configure Selected Products</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProducts.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center">
                  <Package className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>Select products to configure barcode details</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {selectedProducts.map(({ product, netWeight, packageDate, expiryDate }) => (
                  <div key={product.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="text-xs text-gray-600">SKU: {product.sku}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeSelectedProduct(product.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Net Weight */}
                    <div className="space-y-1">
                      <Label className="text-xs">Net Weight *</Label>
                      <Input
                        value={netWeight}
                        onChange={(e) => updateSelectedProduct(product.id, "netWeight", e.target.value)}
                        placeholder="e.g., 500g, 1kg, 250ml"
                        className="text-sm"
                      />
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Package Date *</Label>
                        <DatePicker
                          date={packageDate}
                          onDateChange={(date) => updateSelectedProduct(product.id, "packageDate", date)}
                          placeholder="Package date"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Expiry Date *</Label>
                        <DatePicker
                          date={expiryDate}
                          onDateChange={(date) => updateSelectedProduct(product.id, "expiryDate", date)}
                          placeholder="Expiry date"
                        />
                      </div>
                    </div>

                    {/* Price Preview */}
                    {netWeight && (
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <strong>Calculated Price:</strong> Rs{" "}
                        {Math.round(calculatePriceByWeight(netWeight, product.sales_rate_exc_dis_and_tax))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
