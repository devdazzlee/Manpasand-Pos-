"use client"

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

interface DataProviderProps {
  children: React.ReactNode
}

export function DataProvider({ children }: DataProviderProps) {
  const { fetchProducts, fetchCategories, fetchCustomers } = useStore()
  const { toast } = useToast()

  useEffect(() => {

    const token = localStorage.getItem('token')
    if (!token) return
    
    const initializeData = async () => {
      try {
        // Initialize all data in parallel
        await Promise.all([
          fetchProducts(),
          fetchCategories(),
          fetchCustomers()
        ])
        console.log('✅ All data initialized successfully')
      } catch (error) {
        console.error('❌ Failed to initialize data:', error)
        toast({
          variant: "destructive",
          title: "Data Loading Error",
          description: "Some data failed to load. Please refresh the page.",
        })
      }
    }

    initializeData()
  }, [fetchProducts, fetchCategories, fetchCustomers, toast])

  return <>{children}</>
} 