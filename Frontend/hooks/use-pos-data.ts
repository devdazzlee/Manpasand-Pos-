import { useStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

export function usePosData() {
  const store = useStore()
  const { toast } = useToast()

  const refreshAllData = async () => {
    try {
      await Promise.all([
        store.fetchProducts(true),
        store.fetchCategories(true),
        store.fetchCustomers(true)
      ])
      toast({
        title: "Data Refreshed",
        description: "All data has been updated successfully",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Failed to refresh data",
      })
    }
  }

  const isAnyLoading = store.productsLoading || store.categoriesLoading || store.customersLoading

  return {
    // Data
    products: store.products,
    categories: store.categories,
    customers: store.customers,
    
    // Loading states
    productsLoading: store.productsLoading,
    categoriesLoading: store.categoriesLoading,
    customersLoading: store.customersLoading,
    isAnyLoading,
    
    // Actions
    refreshAllData,
    fetchProducts: (force?: boolean, search?: string) => store.fetchProducts(force, search),
    fetchCategories: store.fetchCategories,
    fetchCustomers: store.fetchCustomers,
    clearStore: store.clearStore,
  }
} 