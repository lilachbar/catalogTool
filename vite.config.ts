import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Vite backend-integration build: no index.html entry. We emit a manifest and
// hashed assets into catalog_tool/web/static/dist, which Flask serves at
// /static/dist/. In dev, the Vite dev server (port 5173) provides HMR and
// Flask injects the dev client + entry via templates (see vite_assets helper).
const UI_ROOT = fileURLToPath(new URL("./catalog_tool/web/ui", import.meta.url));
const OUT_DIR = fileURLToPath(new URL("./catalog_tool/web/static/dist", import.meta.url));

export default defineConfig(({ command }) => ({
  root: UI_ROOT,
  // Dev server serves entries at the origin root for simple HMR URLs; the
  // production build is served by Flask from /static/dist/.
  base: command === "serve" ? "/" : "/static/dist/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": UI_ROOT,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    origin: "http://localhost:5173",
    cors: true,
    fs: {
      // Allow importing the chat client that still lives in web/src during
      // the incremental migration (outside the Vite root at web/ui).
      allow: [fileURLToPath(new URL("./catalog_tool/web", import.meta.url))],
    },
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    manifest: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./catalog_tool/web/ui/main.tsx", import.meta.url)),
      },
    },
  },
}));
