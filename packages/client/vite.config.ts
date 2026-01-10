import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Plugin to stub out unused wagmi connector dependencies
function stubUnusedDependencies(): Plugin {
  const stubbedModules = [
    "@safe-global/safe-apps-sdk",
    "@safe-global/safe-apps-provider",
    "@reown/appkit",
  ];

  return {
    name: "stub-unused-deps",
    resolveId(id) {
      if (stubbedModules.some(mod => id === mod || id.startsWith(mod + "/"))) {
        return { id: "virtual:empty-module", moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (id === "virtual:empty-module") {
        return "export default {}; export const SafeAppProvider = undefined; export const SDK = undefined; export const AppKit = undefined;";
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    stubUnusedDependencies(),
    react(),
  ],
  // Load .env from monorepo root
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
