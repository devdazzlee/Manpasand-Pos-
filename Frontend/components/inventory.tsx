"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Search, Plus, Edit, Package, AlertTriangle, Upload, X, ImageIcon } from "lucide-react"
import apiClient from "@/lib/apiClient"

// Image compression utility
const compressImage = (file: File, quality = 0.7, maxWidth = 800, maxHeight = 600): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          } else {
            reject(new Error("Canvas to Blob conversion failed"))
          }
        },
        file.type,
        quality,
      )
    }

    img.onerror = () => reject(new Error("Image load failed"))
    img.src = URL.createObjectURL(file)
  })
}

// Types and Interfaces
interface DropdownOption {
  id: string
  name: string
  percentage?: number // for taxes
  is_active?: boolean
}

interface Product {
  id: string
  name: string
  sku: string
  code: string
  pct_or_hs_code?: string
  description?: string
  purchase_rate: number
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  discount_amount?: number
  min_qty?: number
  max_qty?: number
  is_active: boolean
  display_on_pos: boolean
  is_batch: boolean
  auto_fill_on_demand_sheet: boolean
  non_inventory_item: boolean
  is_deal: boolean
  is_featured: boolean
  unit?: DropdownOption
  tax?: DropdownOption
  category?: DropdownOption
  subcategory?: DropdownOption
  supplier?: DropdownOption
  brand?: DropdownOption
  color?: DropdownOption
  size?: DropdownOption
  created_at: string
  updated_at: string
  images?: { id: string; image_url: string }[]
}

interface ProductFormData {
  name: string
  unit_id: string
  pct_or_hs_code?: string
  description?: string
  sku: string
  purchase_rate: number
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  discount_amount?: number
  tax_id?: string
  category_id: string
  subcategory_id?: string
  min_qty?: number
  max_qty?: number
  supplier_id?: string
  brand_id?: string
  color_id?: string
  size_id?: string
  is_active?: boolean
  display_on_pos?: boolean
  is_batch?: boolean
  auto_fill_on_demand_sheet?: boolean
  non_inventory_item?: boolean
  is_deal?: boolean
  is_featured?: boolean
  images?: (string | File)[]
}

const ProductForm = ({
  onSubmit,
  loading,
  submitText,
  formData,
  formErrors,
  updateFormData,
  units,
  categories,
  subcategories,
  taxes,
  suppliers,
  brands,
  colors,
  sizes,
  imagePreviews,
  handleRemoveImage,
  fileInputRef,
  handleImageSelect,
}: {
  onSubmit: () => void
  loading: boolean
  submitText: string
  formData: ProductFormData
  formErrors: { sku?: string; pct_or_hs_code?: string }
  updateFormData: (field: keyof ProductFormData, value: any) => void
  units: DropdownOption[]
  categories: DropdownOption[]
  subcategories: DropdownOption[]
  taxes: DropdownOption[]
  suppliers: DropdownOption[]
  brands: DropdownOption[]
  colors: DropdownOption[]
  sizes: DropdownOption[]
  imagePreviews: string[]
  handleRemoveImage: (index: number) => void
  fileInputRef: React.RefObject<HTMLInputElement>
  handleImageSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
}) => {
  const hasErrors = Object.values(formErrors).some((error) => !!error)

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateFormData("name", e.target.value)}
              placeholder="Enter product name"
            />
          </div>
          <div>
            <Label htmlFor="sku">SKU *</Label>
            <Input
              id="sku"
              type="text"
              value={formData.sku}
              onChange={(e) => updateFormData("sku", e.target.value)}
              placeholder="Enter SKU"
              className={formErrors.sku ? "border-red-500" : ""}
            />
            {formErrors.sku && <p className="text-sm text-red-500 mt-1">{formErrors.sku}</p>}
          </div>
          <div>
            <Label htmlFor="unit_id">Unit *</Label>
            <Select value={formData.unit_id} onValueChange={(value) => updateFormData("unit_id", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="category_id">Category *</Label>
            <Select value={formData.category_id} onValueChange={(value) => updateFormData("category_id", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="subcategory_id">Subcategory</Label>
            <Select
              value={formData.subcategory_id || ""}
              onValueChange={(value) => updateFormData("subcategory_id", value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {subcategories.map((subcategory) => (
                  <SelectItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pct_or_hs_code">PCT/HS Code</Label>
            <Input
              id="pct_or_hs_code"
              type="text"
              value={formData.pct_or_hs_code || ""}
              onChange={(e) => updateFormData("pct_or_hs_code", e.target.value)}
              placeholder="Enter PCT/HS code"
              className={formErrors.pct_or_hs_code ? "border-red-500" : ""}
            />
            {formErrors.pct_or_hs_code && (
              <p className="text-sm text-red-500 mt-1">{formErrors.pct_or_hs_code}</p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description || ""}
            onChange={(e) => updateFormData("description", e.target.value)}
            placeholder="Enter product description"
            rows={3}
          />
        </div>
      </div>

      {/* Pricing Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Pricing Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="purchase_rate">Purchase Rate *</Label>
            <Input
              id="purchase_rate"
              type="number"
              step="0.01"
              value={formData.purchase_rate}
              onChange={(e) => updateFormData("purchase_rate", Number.parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="sales_rate_exc_dis_and_tax">Sales Rate (Exc. Discount & Tax) *</Label>
            <Input
              id="sales_rate_exc_dis_and_tax"
              type="number"
              step="0.01"
              value={formData.sales_rate_exc_dis_and_tax}
              onChange={(e) =>
                updateFormData("sales_rate_exc_dis_and_tax", Number.parseFloat(e.target.value) || 0)
              }
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="sales_rate_inc_dis_and_tax">Sales Rate (Inc. Discount & Tax) *</Label>
            <Input
              id="sales_rate_inc_dis_and_tax"
              type="number"
              step="0.01"
              value={formData.sales_rate_inc_dis_and_tax}
              onChange={(e) =>
                updateFormData("sales_rate_inc_dis_and_tax", Number.parseFloat(e.target.value) || 0)
              }
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="discount_amount">Discount Amount</Label>
            <Input
              id="discount_amount"
              type="number"
              step="0.01"
              value={formData.discount_amount || 0}
              onChange={(e) => updateFormData("discount_amount", Number.parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="tax_id">Tax</Label>
            <Select
              value={formData.tax_id || ""}
              onValueChange={(value) => updateFormData("tax_id", value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tax" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {taxes.map((tax) => (
                  <SelectItem key={tax.id} value={tax.id}>
                    {tax.name} {tax.percentage && `(${tax.percentage}%)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Inventory Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Inventory Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_qty">Minimum Quantity</Label>
            <Input
              id="min_qty"
              type="number"
              value={formData.min_qty || 0}
              onChange={(e) => updateFormData("min_qty", Number.parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="max_qty">Maximum Quantity</Label>
            <Input
              id="max_qty"
              type="number"
              value={formData.max_qty || 0}
              onChange={(e) => updateFormData("max_qty", Number.parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Additional Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="supplier_id">Supplier</Label>
            <Select
              value={formData.supplier_id || ""}
              onValueChange={(value) => updateFormData("supplier_id", value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="brand_id">Brand</Label>
            <Select
              value={formData.brand_id || ""}
              onValueChange={(value) => updateFormData("brand_id", value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="color_id">Color</Label>
            <Select
              value={formData.color_id || ""}
              onValueChange={(value) => updateFormData("color_id", value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {colors.map((color) => (
                  <SelectItem key={color.id} value={color.id}>
                    {color.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="size_id">Size</Label>
            <Select
              value={formData.size_id || ""}
              onValueChange={(value) => updateFormData("size_id", value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {sizes.map((size) => (
                  <SelectItem key={size.id} value={size.id}>
                    {size.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Product Images */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Product Images</h3>
        <div className="space-y-2">
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveImage(index)}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div
            className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Click or drag to upload images</p>
            <p className="text-xs text-gray-400">PNG, JPG up to 5MB (max 10 images)</p>
          </div>
          <input
            ref={fileInputRef}
            id="images"
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
            disabled={loading || imagePreviews.length >= 10}
          />
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => updateFormData("is_active", checked)}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="display_on_pos"
              checked={formData.display_on_pos}
              onCheckedChange={(checked) => updateFormData("display_on_pos", checked)}
            />
            <Label htmlFor="display_on_pos">Display on POS</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_batch"
              checked={formData.is_batch}
              onCheckedChange={(checked) => updateFormData("is_batch", checked)}
            />
            <Label htmlFor="is_batch">Is Batch</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="auto_fill_on_demand_sheet"
              checked={formData.auto_fill_on_demand_sheet}
              onCheckedChange={(checked) => updateFormData("auto_fill_on_demand_sheet", checked)}
            />
            <Label htmlFor="auto_fill_on_demand_sheet">Auto Fill on Demand Sheet</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="non_inventory_item"
              checked={formData.non_inventory_item}
              onCheckedChange={(checked) => updateFormData("non_inventory_item", checked)}
            />
            <Label htmlFor="non_inventory_item">Non Inventory Item</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_deal"
              checked={formData.is_deal}
              onCheckedChange={(checked) => updateFormData("is_deal", checked)}
            />
            <Label htmlFor="is_deal">Is Deal</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_featured"
              checked={formData.is_featured}
              onCheckedChange={(checked) => updateFormData("is_featured", checked)}
            />
            <Label htmlFor="is_featured">Is Featured</Label>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={
            loading || !formData.name || !formData.sku || !formData.unit_id || !formData.category_id || hasErrors
          }
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {submitText}...
            </>
          ) : (
            submitText
          )}
        </Button>
      </div>
    </div>
  )
}

export default function Inventory() {
  const { toast } = useToast()

  // State for products and pagination
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [totalProducts, setTotalProducts] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [gotoPage, setGotoPage] = useState<string>("")

  // State for filters
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedSubcategory, setSelectedSubcategory] = useState("all")

  // State for dropdown options
  const [units, setUnits] = useState<DropdownOption[]>([])
  const [taxes, setTaxes] = useState<DropdownOption[]>([])
  const [categories, setCategories] = useState<DropdownOption[]>([])
  const [subcategories, setSubcategories] = useState<DropdownOption[]>([])
  const [suppliers, setSuppliers] = useState<DropdownOption[]>([])
  const [brands, setBrands] = useState<DropdownOption[]>([])
  const [colors, setColors] = useState<DropdownOption[]>([])
  const [sizes, setSizes] = useState<DropdownOption[]>([])

  // State for form
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    unit_id: "",
    sku: "",
    purchase_rate: 0,
    sales_rate_exc_dis_and_tax: 0,
    sales_rate_inc_dis_and_tax: 0,
    category_id: "",
    is_active: true,
    display_on_pos: true,
    is_batch: false,
    auto_fill_on_demand_sheet: false,
    non_inventory_item: false,
    is_deal: false,
    is_featured: false,
    images: [],
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<{ sku?: string; pct_or_hs_code?: string }>({})
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // API Service Functions
  const apiService = {
    // Dropdown data fetchers
    async getUnits() {
      const response = await apiClient.get("/units")
      return response.data
    },

    async getTaxes() {
      const response = await apiClient.get("/taxes")
      return response.data
    },

    async getCategories() {
      const response = await apiClient.get("/categories")
      return response.data
    },

    async getSubcategories() {
      const response = await apiClient.get("/subcategories")
      return response.data
    },

    async getSuppliers() {
      const response = await apiClient.get("/suppliers")
      return response.data
    },

    async getBrands() {
      const response = await apiClient.get("/brands")
      return response.data
    },

    async getColors() {
      const response = await apiClient.get("/colors")
      return response.data
    },

    async getSizes() {
      const response = await apiClient.get("/sizes")
      return response.data
    },

    // Product operations
    async getProducts(params?: {
      page?: number
      limit?: number
      search?: string
      category_id?: string
      subcategory_id?: string
      is_active?: boolean
      display_on_pos?: boolean
    }) {
      const response = await apiClient.get("/products", { params })
      return response.data
    },

    async createProduct(productData: ProductFormData) {
      const response = await apiClient.post("/products", productData)
      return response.data
    },

    async updateProduct(id: string, productData: any) {
      const response = await apiClient.patch(`/products/${id}`, productData)
      return response.data
    },

    async toggleProductStatus(id: string) {
      const response = await apiClient.patch(`/products/${id}/toggle-status`)
      return response.data
    },
  }

  // Load dropdown data on component mount
  useEffect(() => {
    loadDropdownData()
  }, [])

  // Load products when filters change
  useEffect(() => {
    loadProducts()
  }, [currentPage, searchTerm, selectedCategory, selectedSubcategory, pageSize])

  const loadDropdownData = async () => {
    try {
      const [
        unitsData,
        taxesData,
        categoriesData,
        subcategoriesData,
        suppliersData,
        brandsData,
        colorsData,
        sizesData,
      ] = await Promise.all([
        apiService.getUnits(),
        apiService.getTaxes(),
        apiService.getCategories(),
        apiService.getSubcategories(),
        apiService.getSuppliers(),
        apiService.getBrands(),
        apiService.getColors(),
        apiService.getSizes(),
      ])

      setUnits(unitsData.data || unitsData)
      setTaxes(taxesData.data || taxesData)
      setCategories(categoriesData.data || categoriesData)
      setSubcategories(subcategoriesData.data || subcategoriesData)
      setSuppliers(suppliersData.data || suppliersData)
      setBrands(brandsData.data || brandsData)
      setColors(colorsData.data || colorsData)
      setSizes(sizesData.data || sizesData)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load dropdown data",
        variant: "destructive",
      })
    }
  }

  const loadProducts = async () => {
    setLoading(true)
    try {
      const params: any = {
        page: currentPage,
        limit: pageSize === 0 ? 100000 : pageSize, // 0 means 'All', set a very high number
        search: searchTerm || undefined,
        category_id: selectedCategory === "all" ? undefined : selectedCategory,
        subcategory_id: selectedSubcategory === "all" ? undefined : selectedSubcategory,
      }
      if (pageSize === 0) delete params.page // remove page param for 'All'
      const response = await apiService.getProducts(params)

      // Handle inconsistent API responses for the product list
      const productsArray = Array.isArray(response) ? response : response?.data || []
      const total = Array.isArray(response) ? productsArray.length : response?.meta?.total || 0

      const productsData = productsArray.map((product: any) => ({
        ...product,
        purchase_rate: parseFloat(product.purchase_rate) || 0,
        sales_rate_exc_dis_and_tax: parseFloat(product.sales_rate_exc_dis_and_tax) || 0,
        sales_rate_inc_dis_and_tax: parseFloat(product.sales_rate_inc_dis_and_tax) || 0,
        discount_amount: product.discount_amount ? parseFloat(product.discount_amount) : undefined,
        min_qty: product.min_qty ? parseInt(product.min_qty) : undefined,
        max_qty: product.max_qty ? parseInt(product.max_qty) : undefined,
        sku: product.sku ? String(product.sku) : "",
        pct_or_hs_code: product.pct_or_hs_code ? String(product.pct_or_hs_code) : undefined,
        description: product.description ? String(product.description) : undefined,
      }))

      setProducts(productsData)
      setTotalProducts(total || productsData.length)
    } catch (error) {
      console.error("Failed to load products:", error)
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProduct = async () => {
    setFormLoading(true)
    try {
      const dataToSubmit = {
        ...formData,
        sku: String(formData.sku),
        pct_or_hs_code: formData.pct_or_hs_code ? String(formData.pct_or_hs_code) : undefined,
      }

      await apiService.createProduct(dataToSubmit)

      toast({
        title: "Success",
        description: "Product created successfully",
      })

      setIsAddDialogOpen(false)
      resetForm()
      loadProducts()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create product",
        variant: "destructive",
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleUpdateProduct = async () => {
    if (!editingProduct) return

    setFormLoading(true)
    try {
      const dataToSubmit = {
        ...formData,
        sku: String(formData.sku),
        pct_or_hs_code: formData.pct_or_hs_code ? String(formData.pct_or_hs_code) : undefined,
      }
      await apiService.updateProduct(editingProduct.id, dataToSubmit)

      toast({
        title: "Success",
        description: "Product updated successfully",
      })

      setIsEditDialogOpen(false)
      setEditingProduct(null)
      resetForm()
      loadProducts()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive",
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleToggleStatus = async (id: string) => {
    try {
      await apiService.toggleProductStatus(id)
      toast({
        title: "Success",
        description: "Product status updated successfully",
      })
      loadProducts()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product status",
        variant: "destructive",
      })
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      unit_id: "",
      sku: "",
      purchase_rate: 0,
      sales_rate_exc_dis_and_tax: 0,
      sales_rate_inc_dis_and_tax: 0,
      category_id: "",
      is_active: true,
      display_on_pos: true,
      is_batch: false,
      auto_fill_on_demand_sheet: false,
      non_inventory_item: false,
      is_deal: false,
      is_featured: false,
      images: [],
    })
    setImagePreviews([])
  }

  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      unit_id: product.unit?.id || "",
      pct_or_hs_code: product.pct_or_hs_code || "",
      description: product.description || "",
      sku: product.sku,
      purchase_rate: product.purchase_rate,
      sales_rate_exc_dis_and_tax: product.sales_rate_exc_dis_and_tax,
      sales_rate_inc_dis_and_tax: product.sales_rate_inc_dis_and_tax,
      discount_amount: product.discount_amount || 0,
      tax_id: product.tax?.id || "",
      category_id: product.category?.id || "",
      subcategory_id: product.subcategory?.id || "",
      min_qty: product.min_qty || 0,
      max_qty: product.max_qty || 0,
      supplier_id: product.supplier?.id || "",
      brand_id: product.brand?.id || "",
      color_id: product.color?.id || "",
      size_id: product.size?.id || "",
      is_active: product.is_active,
      display_on_pos: product.display_on_pos,
      is_batch: product.is_batch,
      auto_fill_on_demand_sheet: product.auto_fill_on_demand_sheet,
      non_inventory_item: product.non_inventory_item,
      is_deal: product.is_deal,
      is_featured: product.is_featured,
      images: product.images?.map((img) => img.image_url) || [],
    })
    setImagePreviews(product.images?.map((img) => img.image_url) || [])
    setIsEditDialogOpen(true)
  }

  const updateFormData = (field: keyof ProductFormData, value: any) => {
    setFormData({ ...formData, [field]: value })

    if (field === "sku" || field === "pct_or_hs_code") {
      // Basic validation: prevent purely numeric strings that might be misinterpreted as numbers.
      if (value && /^\d+$/.test(value)) {
        setFormErrors((prev) => ({ ...prev, [field]: "This field must be a string (e.g., add a letter)." }))
      } else {
        setFormErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[field]
          return newErrors
        })
      }
    }
  }

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    setFormLoading(true)
    try {
      const compressedImages = await Promise.all(
        Array.from(files).map(async (file) => {
          if (!file.type.startsWith("image/")) {
            toast({ title: "Error", description: `${file.name} is not an image.`, variant: "destructive" })
            return null
          }
          if (file.size > 5 * 1024 * 1024) {
            toast({ title: "Error", description: `Image ${file.name} is larger than 5MB.`, variant: "destructive" })
            return null
          }
          return await compressImage(file)
        }),
      )

      const validFiles = compressedImages.filter((f): f is File => f !== null)

      const base64Promises = validFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })
      })

      const newBase64Images = await Promise.all(base64Promises)
      const newImages = [...(formData.images || []), ...newBase64Images]
      const newPreviews = [...imagePreviews, ...newBase64Images]

      setFormData({ ...formData, images: newImages })
      setImagePreviews(newPreviews)
    } catch (error) {
      toast({ title: "Error", description: "Failed to process images.", variant: "destructive" })
    } finally {
      setFormLoading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemoveImage = (index: number) => {
    const newImages = [...(formData.images || [])]
    const newPreviews = [...imagePreviews]

    newImages.splice(index, 1)
    newPreviews.splice(index, 1)

    setFormData({ ...formData, images: newImages })
    setImagePreviews(newPreviews)
  }

  const totalPages = Math.ceil(totalProducts / pageSize)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Management</h1>
            <p className="text-gray-600">Manage your products and inventory</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <ProductForm
                onSubmit={handleCreateProduct}
                loading={formLoading}
                submitText="Create Product"
                formData={formData}
                formErrors={formErrors}
                updateFormData={updateFormData}
                units={units}
                categories={categories}
                subcategories={subcategories}
                taxes={taxes}
                suppliers={suppliers}
                brands={brands}
                colors={colors}
                sizes={sizes}
                imagePreviews={imagePreviews}
                handleRemoveImage={handleRemoveImage}
                fileInputRef={fileInputRef}
                handleImageSelect={handleImageSelect}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProducts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Products</CardTitle>
              <Package className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{products.filter((p) => p.is_active).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Featured Products</CardTitle>
              <AlertTriangle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{products.filter((p) => p.is_featured).length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Subcategories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subcategories</SelectItem>
              {subcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setCurrentPage(1); }}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Page Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="0">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Products ({totalProducts})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Purchase Rate</TableHead>
                      <TableHead>Sales Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{product.name}</div>
                            {product.is_featured && (
                              <Badge variant="secondary" className="text-xs mt-1">
                                Featured
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{product.sku}</TableCell>
                        <TableCell>{product.category_id || "-"}</TableCell>
                        <TableCell>{product.unit_id || "-"}</TableCell>
                        <TableCell>{product.purchase_rate.toFixed(2)}</TableCell>
                        <TableCell>{product.sales_rate_exc_dis_and_tax.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            className={product.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                          >
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(product)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleStatus(product.id)}
                              className={
                                product.is_active
                                  ? "text-red-600 hover:text-red-700"
                                  : "text-green-600 hover:text-green-700"
                              }
                            >
                              {product.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Pagination */}
                {(totalPages > 1 || pageSize === 0) && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-4 space-y-2 md:space-y-0">
                    <div className="text-sm text-gray-500 mb-2 md:mb-0">
                      {pageSize === 0 ? (
                        <>Showing all {totalProducts} products</>
                      ) : (
                        <>Page {currentPage} of {totalPages} (Total: {totalProducts} products)</>
                      )}
                    </div>
                    {pageSize !== 0 && (
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          max={totalPages}
                          value={gotoPage}
                          onChange={e => setGotoPage(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const page = Math.max(1, Math.min(Number(gotoPage), totalPages))
                              if (!isNaN(page)) setCurrentPage(page)
                              setGotoPage("")
                            }
                          }}
                          placeholder="Go to page"
                          className="w-24 h-8 px-2 text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          Last
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit Product Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <ProductForm
              onSubmit={handleUpdateProduct}
              loading={formLoading}
              submitText="Update Product"
              formData={formData}
              formErrors={formErrors}
              updateFormData={updateFormData}
              units={units}
              categories={categories}
              subcategories={subcategories}
              taxes={taxes}
              suppliers={suppliers}
              brands={brands}
              colors={colors}
              sizes={sizes}
              imagePreviews={imagePreviews}
              handleRemoveImage={handleRemoveImage}
              fileInputRef={fileInputRef}
              handleImageSelect={handleImageSelect}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
