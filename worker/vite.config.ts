import { defineConfig, type Plugin } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
  publicDir: "../site/dist",
  server: { host: "localhost", port: 8787, strictPort: true },
  plugins: process.env.VITEST ? [] : (cloudflare({ types: { generate: false } }) as Plugin[]),
});
