import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { DataProvider } from "@/components/data-provider"
import { OfflineProvider } from "@/components/offline-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MANPASAND POS System",
  description: "Professional Point of Sale System",
  generator: 'v0.dev',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MANPASAND POS',
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <DataProvider>
          <OfflineProvider>
            {children}
          </OfflineProvider>
        </DataProvider>
        <Toaster />
      </body>
    </html>
  )
}
