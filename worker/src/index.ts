import { handleDevcardRequest } from "./api.ts";
import { fetchProfile, type CachedProfile } from "./profile.ts";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/github-devcard/api/")) {
      url.pathname = url.pathname.slice("/github-devcard".length);
      request = new Request(url, request);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const cardCache = await caches.open("github-devcards-v1");
    return handleDevcardRequest(
      request,
      async (username) => {
        const key = new Request(
          new URL(`/__profile-cache/v1/${username.toLowerCase()}`, url.origin),
        );
        const cache = await caches.open("github-profiles-v1");
        const cached = await cache.match(key);
        if (cached) return cached.json() as Promise<CachedProfile>;
        const profile = await fetchProfile(username.toLowerCase(), env.GITHUB_TOKEN);
        ctx.waitUntil(
          cache
            .put(
              key,
              Response.json(profile, {
                headers: { "Cache-Control": "public, max-age=1800" },
              }),
            )
            .catch((error: unknown) => console.error("Profile cache write failed", error)),
        );
        return profile;
      },
      cardCache,
      ctx,
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;
