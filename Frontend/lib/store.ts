import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from './apiClient'

interface Product {
  id: string
  name: string
  price: number
  category: string
  stock: number
  categoryId: string
  current_stock?: number
  available_stock?: number
  reserved_stock?: number
  minimum_stock?: number
  maximum_stock?: number
  sku?: string
  subcategoryId?: string
  subcategory?: string
  unitId?: string
  unitName?: string
  taxId?: string
  taxName?: string
  supplierId?: string
  supplierName?: string
  brandId?: string
  brandName?: string
  colorId?: string
  colorName?: string
  sizeId?: string
  sizeName?: string
  purchase_rate?: number
  sales_rate_exc_dis_and_tax?: number
  sales_rate_inc_dis_and_tax?: number
  discount_amount?: number
  min_qty?: number
  max_qty?: number
  is_active?: boolean
  display_on_pos?: boolean
  is_batch?: boolean
  auto_fill_on_demand_sheet?: boolean
  non_inventory_item?: boolean
  is_deal?: boolean
  is_featured?: boolean
  pct_or_hs_code?: string
  description?: string
  created_at?: string
  updated_at?: string
  images?: any[]
}

interface Category {
  id: string
  name: string
}

interface Customer {
  id: string
  email: string
  name?: string
}

interface StoreState {
  // Data
  products: Product[]
  categories: Category[]
  customers: Customer[]
  
  // Loading states
  productsLoading: boolean
  categoriesLoading: boolean
  customersLoading: boolean
  
  // Last fetch timestamps
  lastProductsFetch: number | null
  lastCategoriesFetch: number | null
  lastCustomersFetch: number | null
  
  // Actions
  fetchProducts: (force?: boolean) => Promise<void>
  fetchCategories: (force?: boolean) => Promise<void>
  fetchCustomers: (force?: boolean) => Promise<void>
  clearStore: () => void
}

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      products: [],
      categories: [],
      customers: [],
      productsLoading: false,
      categoriesLoading: false,
      customersLoading: false,
      lastProductsFetch: null,
      lastCategoriesFetch: null,
      lastCustomersFetch: null,

      // Fetch products with caching
      fetchProducts: async (force = false) => {
        const state = get()
        const now = Date.now()
        
        // Check if we have cached data and it's still valid
        if (!force && 
            state.products.length > 0 && 
            state.lastProductsFetch && 
            (now - state.lastProductsFetch) < CACHE_DURATION) {
          console.log('Using cached products data')
          return
        }

        set({ productsLoading: true })
        
        try {
          // Get branch_id from localStorage if available
          let branchId = null
          try {
            const branchStr = localStorage.getItem("branch")
            if (branchStr) {
              const branchObj = JSON.parse(branchStr)
              branchId = branchObj.id || branchStr
            }
          } catch (e) {
            // If parsing fails, use the raw string
            branchId = localStorage.getItem("branch")
          }

          const res = await apiClient.get("/products", {
            params: {
              limit: 1000,
              page: 1,
              branch_id: branchId
            }
          })
          
          const apiProducts = res.data.data.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: Number(item.sales_rate_inc_dis_and_tax ?? item.sales_rate_exc_dis_and_tax ?? item.purchase_rate ?? 0),
            category: item.category?.name,
            categoryId: item.category?.id,
            stock: item.available_stock ?? item.current_stock ?? 0, // Use actual stock instead of max_qty
            current_stock: item.current_stock ?? 0,
            available_stock: item.available_stock ?? 0,
            reserved_stock: item.reserved_stock ?? 0,
            minimum_stock: item.minimum_stock ?? 0,
            maximum_stock: item.maximum_stock ?? 0,
            sku: item.sku,
            subcategoryId: item.subcategory?.id,
            subcategory: item.subcategory?.name,
            unitId: item.unit?.id,
            unitName: item.unit?.name,
            taxId: item.tax?.id,
            taxName: item.tax?.name,
            supplierId: item.supplier?.id,
            supplierName: item.supplier?.name,
            brandId: item.brand?.id,
            brandName: item.brand?.name,
            colorId: item.color?.id,
            colorName: item.color?.name,
            sizeId: item.size?.id,
            sizeName: item.size?.name,
            purchase_rate: Number(item.purchase_rate) || 0,
            sales_rate_exc_dis_and_tax: Number(item.sales_rate_exc_dis_and_tax) || 0,
            sales_rate_inc_dis_and_tax: Number(item.sales_rate_inc_dis_and_tax) || 0,
            discount_amount: item.discount_amount ? Number(item.discount_amount) : undefined,
            min_qty: item.min_qty ? Number(item.min_qty) : undefined,
            max_qty: item.max_qty ? Number(item.max_qty) : undefined,
            is_active: item.is_active ?? true,
            display_on_pos: item.display_on_pos ?? true,
            is_batch: item.is_batch ?? false,
            auto_fill_on_demand_sheet: item.auto_fill_on_demand_sheet ?? false,
            non_inventory_item: item.non_inventory_item ?? false,
            is_deal: item.is_deal ?? false,
            is_featured: item.is_featured ?? false,
            pct_or_hs_code: item.pct_or_hs_code,
            description: item.description,
            created_at: item.created_at,
            updated_at: item.updated_at,
            images: item.images || [],
          }))
          
          set({ 
            products: apiProducts, 
            productsLoading: false,
            lastProductsFetch: now
          })
          
          console.log(`Loaded ${apiProducts.length} products`)
        } catch (error) {
          console.error('Failed to fetch products:', error)
          set({ productsLoading: false })
          throw error
        }
      },

      // Fetch categories with caching
      fetchCategories: async (force = false) => {
        const state = get()
        const now = Date.now()
        
        if (!force && 
            state.categories.length > 0 && 
            state.lastCategoriesFetch && 
            (now - state.lastCategoriesFetch) < CACHE_DURATION) {
          console.log('Using cached categories data')
          return
        }

        set({ categoriesLoading: true })
        
        try {
          const res = await apiClient.get("/categories")
          const categories = [{ id: "all", name: "All" }, ...res.data.data]
          
          set({ 
            categories, 
            categoriesLoading: false,
            lastCategoriesFetch: now
          })
          
          console.log(`Loaded ${categories.length} categories`)
        } catch (error) {
          console.error('Failed to fetch categories:', error)
          set({ categoriesLoading: false })
          throw error
        }
      },

      // Fetch customers with caching
      fetchCustomers: async (force = false) => {
        const state = get()
        const now = Date.now()
        
        if (!force && 
            state.customers.length > 0 && 
            state.lastCustomersFetch && 
            (now - state.lastCustomersFetch) < CACHE_DURATION) {
          console.log('Using cached customers data')
          return
        }

        set({ customersLoading: true })
        
        try {
          const res = await apiClient.get("/customer")
          
          set({ 
            customers: res.data.data, 
            customersLoading: false,
            lastCustomersFetch: now
          })
          
          console.log(`Loaded ${res.data.data.length} customers`)
        } catch (error) {
          console.error('Failed to fetch customers:', error)
          set({ customersLoading: false })
          throw error
        }
      },

      // Clear all cached data
      clearStore: () => {
        set({
          products: [],
          categories: [],
          customers: [],
          lastProductsFetch: null,
          lastCategoriesFetch: null,
          lastCustomersFetch: null,
        })
      },
    }),
    {
      name: 'pos-store', // localStorage key
      partialize: (state) => ({
        products: state.products,
        categories: state.categories,
        customers: state.customers,
        lastProductsFetch: state.lastProductsFetch,
        lastCategoriesFetch: state.lastCategoriesFetch,
        lastCustomersFetch: state.lastCustomersFetch,
      }),
    }
  )
) 