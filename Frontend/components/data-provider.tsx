"use client"

import { useEffect } from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { startSyncEngine } from "@/lib/offline/sync-engine"
import { startOfflinePrefetch } from "@/lib/offline/prefetch"

interface DataProviderProps {
  children: React.ReactNode
}

export function DataProvider({ children }: DataProviderProps) {
  const { fetchCategories } = useStore()
  const { toast } = useToast()

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    // Ask the browser to keep IndexedDB (outbox + http_cache) across restarts.
    void navigator.storage?.persist?.()

    startSyncEngine()
    startOfflinePrefetch()

    const initializeData = async () => {
      try {
        await Promise.all([fetchCategories(true)])
      } catch (error) {
        console.log("Failed to initialize data:", error)
        if (navigator.onLine) {
          toast({
            variant: "destructive",
            title: "Data Loading Error",
            description: "Some data failed to load. Please refresh the page.",
          })
        }
      }
    }

    void initializeData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
