import { handleDevcardRequest } from "./api.ts";
import { fetchProfile, type CachedProfile } from "./profile.ts";
import { loadCardTypography } from "./devcard.ts";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/github-devcard/api/")) {
      url.pathname = url.pathname.slice("/github-devcard".length);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const cardCache = await caches.open("github-devcards-v1");
    return handleDevcardRequest(
      new Request(url, request),
      async (username) => {
        const key = new Request(
          new URL(`/__profile-cache/v1/${username.toLowerCase()}`, url.origin),
        );
        const cache = await caches.open("github-profiles-v1");
        const cached = await cache.match(key);
        if (cached) return cached.json() as Promise<CachedProfile>;
        // Only cache misses consume GitHub's API quota. Trust Cloudflare's IP
        // header, rather than client-controlled forwarding headers.
        const { success } = await env.PROFILE_RATE_LIMITER.limit({
          key: `profile:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
        });
        if (!success)
          throw Object.assign(new Error("Too many profile requests. Try again in a minute."), {
            status: 429,
            retryAfter: 60,
          });
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
      (value) =>
        loadCardTypography(value, async (path) => {
          const response = await env.ASSETS.fetch(new Request(new URL(path, url.origin)));
          if (!response.ok) throw new Error("Unable to load card fonts.");
          return response.arrayBuffer();
        }),
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;
