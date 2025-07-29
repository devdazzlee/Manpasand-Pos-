"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Printer, Package, Search, Loader2 } from "lucide-react"
import Barcode from "react-barcode"
import apiClient from "@/lib/apiClient"
import { DatePicker } from "./ui/date-picker"
import { PageLoader } from "./ui/page-loader"

interface Product {
  id: string
  code: string
  name: string
  sku: string
  sales_rate_exc_dis_and_tax: string
  unit: {
    id: string
    name: string
  }
  category: {
    name: string
  }
  brand: {
    name: string
  }
}

export default function BarcodeGenerator() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [packageDate, setPackageDate] = useState<Date>()
  const [expiryDate, setExpiryDate] = useState<Date>()
  const [netWeight, setNetWeight] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // Fetch products from API
  const getProducts = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.get("/products")
      console.log("🚀 ~ getProducts ~ response:", response.data.data)
      setProducts(response.data.data || [])
    } catch (error: any) {
      console.error("Error fetching products:", error)
      setError("Failed to fetch products. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getProducts()
  }, [])

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }, [products, searchTerm])

  const handleProductSelect = (productId: string) => {
    const product = products.find((p) => p.id === productId)
    setSelectedProduct(product || null)
    // Reset form when selecting new product
    setNetWeight("")
    setPackageDate(undefined)
    setExpiryDate(undefined)
  }

  const handlePrint = () => {
    if (printRef.current && selectedProduct) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Barcode Label - ${selectedProduct.name}</title>
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  margin: 0; 
                  padding: 20px;
                  background: white;
                }
                .barcode-label {
                  width: 4in;
                  height: 2.5in;
                  border: 2px solid #000;
                  padding: 8px;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                  page-break-after: always;
                }
                .product-info {
                  text-align: center;
                  margin-bottom: 4px;
                }
                .product-name {
                  font-weight: bold;
                  font-size: 16px;
                  margin-bottom: 2px;
                  text-transform: uppercase;
                }
                .product-details {
                  font-size: 11px;
                  margin-bottom: 4px;
                  line-height: 1.2;
                }
                .barcode-container {
                  text-align: center;
                  margin: 4px 0;
                  flex-grow: 1;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .dates {
                  font-size: 9px;
                  display: flex;
                  justify-content: space-between;
                  font-weight: bold;
                  border-top: 1px solid #000;
                  padding-top: 2px;
                }
                .brand-category {
                  font-size: 9px;
                  text-align: center;
                  color: #666;
                  margin-bottom: 2px;
                }
                @media print {
                  body { margin: 0; padding: 0; }
                  .barcode-label { 
                    border: 2px solid #000; 
                    margin: 0;
                  }
                }
              </style>
            </head>
            <body>
              ${printRef.current.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500); // Add a delay to ensure content is rendered
      }
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "__/__/____"
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const isFormValid = selectedProduct && packageDate && expiryDate && netWeight.trim()

  if (loading && products.length === 0) {
    return (
        <PageLoader message="Barcode Generater..." />
    )
  }

  return (
    <div className="p-6 ">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Product Selection and Form */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Barcode Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                {error}
                <Button variant="outline" size="sm" onClick={getProducts} className="ml-2 bg-transparent">
                  Retry
                </Button>
              </div>
            )}

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
              <Label htmlFor="product">Select Product ({filteredProducts.length} found)</Label>
              <Select onValueChange={handleProductSelect} value={selectedProduct?.id || ""}>
                <SelectTrigger>
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
            </div>

            {selectedProduct && (
              <>
                {/* Product Details */}
                <div className="bg-gray-50 p-3 rounded-md space-y-1">
                  <div className="text-sm">
                    <strong>Name:</strong> {selectedProduct.name}
                  </div>
                  <div className="text-sm">
                    <strong>SKU:</strong> {selectedProduct.sku}
                  </div>
                  <div className="text-sm">
                    <strong>Price:</strong> Rs {selectedProduct.sales_rate_exc_dis_and_tax}
                  </div>
                  <div className="text-sm">
                    <strong>Unit:</strong> {selectedProduct.unit.name}
                  </div>
                  <div className="text-sm">
                    <strong>Brand:</strong> {selectedProduct.brand.name}
                  </div>
                  <div className="text-sm">
                    <strong>Category:</strong> {selectedProduct.category.name}
                  </div>
                </div>

                {/* Net Weight */}
                <div className="space-y-2">
                  <Label htmlFor="netWeight">Net Weight *</Label>
                  <Input
                    id="netWeight"
                    value={netWeight}
                    onChange={(e) => setNetWeight(e.target.value)}
                    placeholder="e.g., 500g, 1kg, 250ml"
                  />
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>Package Date *</Label>
                    <DatePicker date={packageDate} onDateChange={setPackageDate} placeholder="Select package date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Date *</Label>
                    <DatePicker date={expiryDate} onDateChange={setExpiryDate} placeholder="Select expiry date" />
                  </div>
                </div>

                <Button onClick={handlePrint} className="w-full" disabled={!isFormValid}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Barcode
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Barcode Preview */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Barcode Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            {selectedProduct ? (
              <div
                ref={printRef}
                className="barcode-label border-2 border-gray-800 p-2 bg-white"
                style={{ width: "4in", height: "2.5in" }}
              >
                <div className="brand-category text-center text-xs text-gray-600 mb-1">
                  {selectedProduct.brand.name} | {selectedProduct.category.name}
                </div>

                <div className="product-info text-center mb-2">
                  <div className="product-name font-bold text-base mb-1 uppercase">{selectedProduct.name}</div>
                  <div className="product-details text-xs space-y-1">
                    <div>
                      <strong>Net Wt:</strong> {netWeight || "Not specified"}
                    </div>
                    <div>
                      <strong>Price:</strong> Rs {selectedProduct.sales_rate_exc_dis_and_tax} /{" "}
                      {selectedProduct.unit.name}
                    </div>
                  </div>
                </div>

                <div className="barcode-container flex justify-center items-center flex-grow">
                  <Barcode
                    value={selectedProduct.sku}
                    width={1.2}
                    height={35}
                    fontSize={8}
                    margin={0}
                    background="transparent"
                  />
                </div>

                <div className="dates text-xs flex justify-between font-bold border-t border-gray-800 pt-1">
                  <span>PKG: {formatDate(packageDate)}</span>
                  <span>EXP: {formatDate(expiryDate)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg w-full">
                <div className="text-center">
                  <Package className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>Select a product to generate barcode</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product List */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Available Products</span>
              <Button variant="outline" size="sm" onClick={getProducts} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  {searchTerm ? "No products found matching your search." : "No products available."}
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedProduct?.id === product.id ? "border-blue-500 bg-blue-50" : ""
                    }`}
                    onClick={() => handleProductSelect(product.id)}
                  >
                    <div className="font-medium text-sm">{product.name}</div>
                    <div className="text-xs text-gray-600">SKU: {product.sku}</div>
                    <div className="text-xs text-gray-600">Price: Rs {product.sales_rate_exc_dis_and_tax}</div>
                    <div className="text-xs text-gray-600">
                      {product.brand.name} | {product.unit.name}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
