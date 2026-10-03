import { devcardQuerySchema, githubUsernameSchema } from "./validation.ts";
import { renderDevcard } from "./devcard.ts";
import type { CachedProfile } from "./profile.ts";

export async function handleDevcardRequest(
  req: Request,
  profile: (username: string) => Promise<CachedProfile>,
  cache: Cache,
  ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  const headers = new Headers({ "X-Content-Type-Options": "nosniff" });
  const head = req.method === "HEAD";
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      headers.set("Allow", "GET, HEAD");
      return new Response(null, { status: 405, headers });
    }
    const url = new URL(req.url);
    if (url.pathname === "/api/profile") {
      const username = githubUsernameSchema.safeParse(url.searchParams.get("username") || "");
      if (!username.success)
        throw Object.assign(new Error(username.error.issues[0].message), { status: 400 });
      const data = await profile(username.data.toLowerCase());
      headers.set("Cache-Control", "public, max-age=300, s-maxage=1800");
      headers.set("Content-Type", "application/json; charset=utf-8");
      return head ? new Response(null, { headers }) : Response.json(data, { headers });
    }
    if (url.pathname !== "/api/devcard")
      return new Response(head ? null : "Not found", { status: 404, headers });
    const parsed = devcardQuerySchema.safeParse({
      username: url.searchParams.get("username") || "",
      theme: url.searchParams.get("theme") || "sky",
      pattern: url.searchParams.get("pattern") || "leaf",
      layout: url.searchParams.get("layout") || "portrait",
      org: url.searchParams.get("org") || "",
    });
    if (!parsed.success)
      throw Object.assign(new Error(parsed.error.issues[0].message), { status: 400 });

    const { username, theme, pattern, org, layout } = parsed.data;
    const cacheUrl = new URL("/__devcard-cache/v1", url);
    cacheUrl.search = new URLSearchParams({
      username: username.toLowerCase(),
      theme,
      pattern,
      layout,
      org: org.toLowerCase(),
    }).toString();
    const cacheKey = new Request(cacheUrl);
    const cached = await cache.match(cacheKey);
    if (cached) return head ? new Response(null, { headers: cached.headers }) : cached;
    const { user, avatar } = await profile(username);
    const logo = org ? (await profile(org)).avatar : "";
    if (org && !logo)
      throw Object.assign(new Error("Unable to fetch the organization logo."), { status: 502 });

    headers.set("Content-Type", "image/svg+xml; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    );

    const response = new Response(renderDevcard(user, theme, avatar, pattern, logo, layout), {
      headers,
    });
    ctx.waitUntil(
      cache
        .put(cacheKey, response.clone())
        .catch((error: unknown) => console.error("Devcard cache write failed", error)),
    );
    return head ? new Response(null, { headers }) : response;
  } catch (caught) {
    const error = caught as Error & { status?: number; retryAfter?: number };
    if (error.retryAfter) headers.set("Retry-After", String(error.retryAfter));
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", "application/json; charset=utf-8");

    const body = { error: error.status ? error.message : "Connection failed. Try again." };
    return head
      ? new Response(null, { status: error.status || 502, headers })
      : Response.json(body, { status: error.status || 502, headers });
  }
}
