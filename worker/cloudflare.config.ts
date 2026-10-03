import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "github-devcard",
    triggers: [
      triggers.fetch({ pattern: "nuskey.md/github-devcard", zone: "nuskey.md" }),
      triggers.fetch({ pattern: "nuskey.md/github-devcard/*", zone: "nuskey.md" }),
      triggers.fetch({ pattern: "www.nuskey.md/github-devcard", zone: "nuskey.md" }),
      triggers.fetch({ pattern: "www.nuskey.md/github-devcard/*", zone: "nuskey.md" }),
    ],
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-10-03",
    compatibilityFlags: ["nodejs_compat"],
    env: {
      ASSETS: bindings.assets(),
      GITHUB_TOKEN: bindings.secret(),
      PROFILE_RATE_LIMITER: bindings.rateLimit({
        namespace: "1001",
        simple: { limit: 20, period: 60 },
      }),
    },
    assets: {
      runWorkerFirst: ["/github-devcard/api/*", "/api/*"],
      notFoundHandling: "none",
    },
    observability: { enabled: true, headSamplingRate: 1 },
  },
});
