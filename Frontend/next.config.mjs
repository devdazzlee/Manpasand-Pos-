/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Enable static HTML export
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: true, // Helps with hosting compatibility
}

// Skip next-pwa entirely for production VPS builds (DISABLE_PWA=1).
// Loading the plugin still pulls workbox/webpack even when "disabled".
const disablePwa =
  process.env.DISABLE_PWA === '1' || process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
let exportConfig = nextConfig;

if (!disablePwa) {
  const withPWA = (await import('next-pwa')).default;
  exportConfig = withPWA({
    dest: 'public',
    disable: false,
    register: true,
    skipWaiting: true,
    buildExcludes: [/middleware-manifest\.json$/],
    publicExcludes: ['!robots.txt', '!sitemap.xml'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
      {
        urlPattern: /^https?:\/\/.*\/api\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 5,
          },
          networkTimeoutSeconds: 120,
        },
      },
      {
        urlPattern: /.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'others',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24,
          },
          networkTimeoutSeconds: 30,
        },
      },
    ],
  })(nextConfig);
}

export default exportConfig;
