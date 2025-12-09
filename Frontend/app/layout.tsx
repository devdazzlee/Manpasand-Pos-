import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { DataProvider } from "@/components/data-provider"
import { PWABanner } from "@/components/pwa-banner"

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
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'MANPASAND POS',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#3b82f6',
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
          {children}
        </DataProvider>
        <PWABanner />
      </body>
    </html>
  )
}
