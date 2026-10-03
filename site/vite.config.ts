import { defineConfig, type Plugin } from "vite-plus";
import { readFile } from "node:fs/promises";
import svgr from "vite-plugin-svgr";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/github-devcard/",
  build: {
    outDir: "dist/github-devcard",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: new URL("./index.html", import.meta.url).pathname,
        about: new URL("./about/index.html", import.meta.url).pathname,
      },
    },
  },
  resolve: { dedupe: ["preact"] },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: { "/github-devcard/api": "http://localhost:8787" },
  },
  plugins: [
    {
      name: "devcard-social-image",
      apply: "build",
      async buildStart() {
        this.emitFile({
          type: "asset",
          fileName: "og-image.png",
          source: await readFile(new URL("../assets/hero.png", import.meta.url)),
        });
      },
    },
    svgr({
      svgrOptions: { jsxRuntime: "automatic" },
      oxcOptions: { jsx: { runtime: "automatic", importSource: "preact" } },
    }) as Plugin,
    ...(preact() as Plugin[]),
  ],
});
