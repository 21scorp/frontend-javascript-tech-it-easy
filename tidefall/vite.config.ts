import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath, URL } from "node:url";

/* SINGLE=1 builds the shareable one-file artifact: every module and
   stylesheet inlined, no service worker, textures injected afterwards
   as data URIs (see scratchpad/build-tidefall-artifact.js). */
const SINGLE = process.env.SINGLE === "1";

export default defineConfig({
  base: "./",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,      // keep textures as files so the SW can cache them
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    ...(SINGLE ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
    ...(SINGLE ? [] : [VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "TIDEFALL",
        short_name: "TIDEFALL",
        description: "Fish, chop, mine, hunt, and build your island holding.",
        theme_color: "#0d1b2a",
        background_color: "#0d1b2a",
        display: "standalone",
        // PORTRAIT IS A HARD CONSTRAINT — the game is designed for one hand.
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webp,json,woff2,mp3,ogg}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    })]),
  ],
});
