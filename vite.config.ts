import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import crypto from "node:crypto";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BUILD_HASH = crypto.randomBytes(8).toString("hex");


const pwaPlugin = VitePWA({
  registerType: "autoUpdate",
  includeAssets: ["favicon.ico", "apple-touch-icon.png", "icons/*.png"],
  manifest: {
    name: "TourismPay",
    short_name: "TourismPay",
    description: "Seamless digital payments for tourists and merchants across Africa",
    theme_color: "#10b981",
    background_color: "#0a0a0a",
    display: "standalone",
    orientation: "portrait-primary",
    scope: "/",
    start_url: "/",
    icons: [
      { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["finance", "travel", "lifestyle"],
    shortcuts: [
      {
        name: "AI Trip Planner",
        short_name: "Trip Plan",
        url: "/tourist/trip-planner",
        icons: [{ src: "/icons/pwa-192.png", sizes: "192x192" }],
      },
      {
        name: "Tourist Experience",
        short_name: "Tourist",
        url: "/tourist",
        icons: [{ src: "/icons/pwa-192.png", sizes: "192x192" }],
      },
      {
        name: "Revenue Dashboard",
        short_name: "Revenue",
        url: "/merchant/revenue",
        icons: [{ src: "/icons/pwa-192.png", sizes: "192x192" }],
      },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MiB — covers the large vendor bundle
    runtimeCaching: [
      {
        urlPattern: /^\/api\/trpc\/(tourist|merchant|loyalty|wallet)/,
        handler: "NetworkFirst" as const,
        options: {
          cacheName: "trpc-api-cache",
          expiration: { maxEntries: 50, maxAgeSeconds: 300 },
        },
      },
      {
        urlPattern: /^\/api\/trpc\/tripPlanner\.(countryMerchants|merchantProducts|searchMerchants)/,
        handler: "StaleWhileRevalidate" as const,
        options: {
          cacheName: "trip-planner-cache",
          expiration: { maxEntries: 100, maxAgeSeconds: 86400 }, // 24h
        },
      },
      {
        urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
        handler: "CacheFirst" as const,
        options: {
          cacheName: "osm-tiles-cache",
          expiration: { maxEntries: 500, maxAgeSeconds: 604800 }, // 7 days
        },
      },
    ],
  },
  devOptions: { enabled: false },
});

const plugins = [react(), tailwindcss(), pwaPlugin];

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_HASH": JSON.stringify(BUILD_HASH),
  },
  optimizeDeps: {
    include: ["react-colorful"],
  },
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-dom/client"],
          "vendor-trpc": ["@trpc/client", "@trpc/react-query", "@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-dropdown-menu"],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
