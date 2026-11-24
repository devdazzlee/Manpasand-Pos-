import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { QueryProvider } from "@/lib/query/query-provider"
import { DataProvider } from "@/components/data-provider"
import { OfflineStatus } from "@/components/offline-status"
import { PWABanner } from "@/components/pwa-banner"
import { Toaster as ToasterOutlet } from "@/components/ui/sonner"
// shadcn Toaster — kept mounted so the many existing `useToast()` callers
// across the app render their notifications too.
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "MANPASAND POS",
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
      <body className={inter.variable}>
        <QueryProvider>
          <DataProvider>
            {children}
            <div className="fixed bottom-4 left-4 z-[60]">
              <OfflineStatus />
            </div>
            <ToasterOutlet position="bottom-right" richColors />
            <ShadcnToaster />
          </DataProvider>
        </QueryProvider>
        <PWABanner />
        {/* Dev: clear stale SWs. Prod: register shell SW so the till opens offline. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    registrations.forEach(function(registration) { registration.unregister(); });
                  });
                  if ('caches' in window) {
                    caches.keys().then(function(names) {
                      names.forEach(function(name) { caches.delete(name); });
                    });
                  }
                } else {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').catch(function(err) {
                      console.warn('[SW] register failed', err);
                    });
                  });
                }
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
