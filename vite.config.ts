import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "locales/**/*.json"],
      manifest: {
        name: "කරන්ට් කට් — Power Outage Tracker",
        short_name: "කරන්ට් කට්",
        description:
          "Real-time crowdsourced power outage tracker for Sri Lanka, with official CEB data overlay.",
        theme_color: "#7c3aed",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "si",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Map tiles — cache aggressively, they rarely change
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
          {
            // App API — stale-while-revalidate so we always show something
            urlPattern: /\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 100, maxAgeSeconds: 5 * 60 },
            },
          },
          {
            // Locale JSONs — cache so language switches work offline
            urlPattern: /\/locales\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "locales" },
          },
        ],
      },
      devOptions: {
        // Disable in dev so the SW doesn't fight HMR
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Proxy /api/* and /ws/* to the local Cloudflare Worker so the
      // browser can call the same origin without CORS during dev.
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
