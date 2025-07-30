import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { DataProvider } from "@/components/data-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MANPASAND POS System",
  description: "Professional Point of Sale System",
    generator: 'v0.dev'
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
        <Toaster />
      </body>
    </html>
  )
}
