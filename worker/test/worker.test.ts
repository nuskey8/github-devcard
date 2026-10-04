import * as renderer from "../src/devcard.ts";
import { test, expect, vi, afterEach, beforeEach } from "vite-plus/test";
import worker from "../src/index.ts";
import { readFile } from "node:fs/promises";

const cachedProfiles = new Map<string, Response>();
const limit = vi.fn(async (_options: { key: string }) => ({ success: true }));
const cache = {
  match: vi.fn(async (key: Request) => cachedProfiles.get(key.url)?.clone()),
  put: vi.fn(async (key: Request, value: Response) => {
    cachedProfiles.set(key.url, value.clone());
  }),
};
const assetFetch = vi.fn(async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (path.startsWith("/github-devcard/fonts/")) {
    return new Response(
      await readFile(
        new URL(`../../site/public${path.replace("/github-devcard", "")}`, import.meta.url),
      ),
    );
  }
  const home = new URL(req.url).pathname === "/";
  return new Response(req.method === "HEAD" ? null : home ? "<!doctype html>" : "Not found", {
    status: home ? 200 : 404,
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
});
const assets = { fetch: assetFetch };

beforeEach(() => {
  cachedProfiles.clear();
  vi.clearAllMocks();
  limit.mockResolvedValue({ success: true });
  vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
});

async function request(url: string, method = "GET", token = "", headers?: HeadersInit) {
  const tasks: Promise<unknown>[] = [];
  const response: Response = await Reflect.apply(worker.fetch, worker, [
    new Request(new URL(url, "http://localhost"), { method, headers }),
    { ASSETS: assets, GITHUB_TOKEN: token, PROFILE_RATE_LIMITER: { limit } },
    { waitUntil: (task: Promise<unknown>) => tasks.push(task) },
  ]);
  await Promise.all(tasks);
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    responseHeaders[name] = value;
  });
  return {
    headers: responseHeaders,
    status: response.status,
    body: await response.text(),
  };
}

test("API validates parameters and restricts routes and methods", async () => {
  for (const url of [
    "/api/devcard",
    "/api/devcard?username=a--b",
    "/api/devcard?username=%3Cscript%3E",
    "/api/devcard?username=octocat&pattern=bad",
    "/api/devcard?username=octocat&pattern=constructor",
    "/api/devcard?username=octocat&org=a--b",
    "/api/devcard?username=octocat&layout=bad",
    "/api/devcard?username=octocat&layout=constructor",
  ])
    expect((await request(url)).status).toBe(400);
  expect((await request("/not-found")).status).toBe(404);
  expect((await request("/api/devcard?username=octocat", "POST")).status).toBe(405);
  expect((await request("/")).status).toBe(200);
  expect((await request("/api/missing")).status).toBe(404);
  expect(limit).not.toHaveBeenCalled();
});

test("HEAD keeps status and headers without a body", async () => {
  const home = await request("/", "HEAD");
  expect(home.status).toBe(200);
  expect(home.headers["content-type"]).toContain("text/html");
  expect(home.body).toBe("");
  const invalid = await request("/api/devcard?username=a--b", "HEAD");
  expect(invalid.status).toBe(400);
  expect(invalid.headers["cache-control"]).toBe("no-store");
  expect(invalid.body).toBe("");
  expect((await request("/missing", "HEAD")).body).toBe("");
});

test("GitHub data and embedded avatar produce SVG and upstream errors are mapped", async () => {
  let calls = 0;
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    calls++;
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.includes("avatars.githubusercontent.com"))
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "Image/PNG; charset=binary" },
      });
    if (href.endsWith("/missing-user")) return new Response("{}", { status: 404 });
    if (href.endsWith("/limited-user")) return new Response("{}", { status: 403 });
    return Response.json({
      login: "test-user",
      name: "Test & User",
      bio: "Hello",
      id: 42,
      public_repos: 10,
      followers: 20,
      created_at: "2020-01-01T00:00:00Z",
      avatar_url: "https://avatars.githubusercontent.com/u/42",
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  {
    const response = await request("/api/devcard?username=test-user");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300, s-maxage=300");
    expect(response.headers["content-type"]).toMatch(/image\/svg\+xml/);
    expect(response.body).toMatch(/Test &amp; User/);
    expect(response.body).toContain("data:image/png;base64,AQID");
    expect(calls).toBe(2);
    expect((await request("/api/devcard?username=missing-user")).status).toBe(404);
    expect((await request("/api/devcard?username=limited-user")).status).toBe(429);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Worker declares a 30-minute cache TTL and refetches evicted profiles", async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      login: "cache-user",
      name: "Cache User",
      bio: null,
      id: 1,
      public_repos: 1,
      followers: 1,
      created_at: "2020-01-01T00:00:00Z",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const url = "/api/devcard?username=cache-user";
  expect((await request(url, "GET", "test-token")).status).toBe(200);
  expect(fetchMock.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }),
  );
  expect(cache.put).toHaveBeenCalledTimes(2);
  expect(cache.put.mock.calls[0][1].headers.get("Cache-Control")).toBe("public, max-age=1800");
  expect((await request("/api/devcard?username=CACHE-USER&theme=paper")).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  cachedProfiles.clear();
  expect((await request(url)).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValueOnce(new Response("{}", { status: 403 }));
  expect((await request("/api/devcard?username=retry-user")).status).toBe(429);
  expect((await request("/api/devcard?username=retry-user")).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("static asset paths are preserved and do not open API caches", async () => {
  await request("/github-devcard/");
  expect(new URL(assetFetch.mock.calls.at(-1)![0].url).pathname).toBe("/github-devcard/");
  await request("/github-devcard/favicon.svg");
  expect(new URL(assetFetch.mock.calls.at(-1)![0].url).pathname).toBe(
    "/github-devcard/favicon.svg",
  );
  await request("/github-devcard/about/");
  expect(new URL(assetFetch.mock.calls.at(-1)![0].url).pathname).toBe("/github-devcard/about/");
  expect(caches.open).not.toHaveBeenCalled();
  expect(limit).not.toHaveBeenCalled();
  expect((await request("/github-devcard/api/devcard?username=a--b")).status).toBe(400);
  expect((await request("/github-devcard/api/devcard?username=octocat", "POST")).status).toBe(405);
  expect((await request("/github-devcard-other")).status).toBe(404);
});

test("profile JSON exposes rendering data and permits five-minute browser caching", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      login: "profile-user",
      name: "Profile User",
      bio: null,
      id: 1,
      public_repos: 2,
      followers: 3,
      created_at: "2020-01-01T00:00:00Z",
      private_field: "not exposed",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const response = await request("/github-devcard/api/profile?username=profile-user");
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("public, max-age=300, s-maxage=1800");
  expect(JSON.parse(response.body)).toEqual({
    user: {
      login: "profile-user",
      name: "Profile User",
      bio: null,
      id: 1,
      public_repos: 2,
      followers: 3,
      created_at: "2020-01-01T00:00:00Z",
    },
    avatar: "",
  });
  const head = await request("/github-devcard/api/profile?username=PROFILE-USER", "HEAD");
  expect(head.status).toBe(200);
  expect(head.body).toBe("");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await request("/api/profile?username=a--b")).status).toBe(400);
  expect((await request("/api/profile?username=profile-user", "POST")).status).toBe(405);
});

test("SVG cache normalizes defaults and usernames, serves HEAD, and expires independently of profiles", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        login: "svg-user",
        name: "SVG User",
        bio: null,
        id: 1,
        public_repos: 2,
        followers: 3,
        created_at: "2020-01-01T00:00:00Z",
      }),
    ),
  );
  const render = vi.spyOn(renderer, "renderDevcard");
  const first = await request("/api/devcard?username=svg-user");
  const second = await request(
    "/github-devcard/api/devcard?pattern=leaf&username=SVG-USER&theme=sky&layout=portrait&unused=1",
  );
  expect(second.body).toBe(first.body);
  expect(render).toHaveBeenCalledTimes(1);
  for (const theme of ["mint", "graphite", "unknown", "constructor"]) {
    const fallback = await request(`/api/devcard?username=svg-user&theme=${theme}`);
    expect(fallback.status).toBe(200);
    expect(fallback.body).toBe(first.body);
  }
  expect(render).toHaveBeenCalledTimes(1);
  const head = await request("/api/devcard?username=svg-user", "HEAD");
  expect(head.body).toBe("");
  expect(head.headers).toEqual(first.headers);
  expect(render).toHaveBeenCalledTimes(1);
  const put = cache.put.mock.calls.find(([key]) => key.url.includes("/__devcard-cache/"))!;
  expect(put[1].headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  cachedProfiles.delete(put[0].url);
  expect((await request("/api/devcard?username=svg-user")).status).toBe(200);
  expect(render).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await request("/api/devcard?username=svg-user&pattern=diamond")).status).toBe(200);
  expect(render).toHaveBeenCalledTimes(3);
  const landscape = await request("/api/devcard?username=svg-user&layout=landscape");
  expect(landscape.status).toBe(200);
  expect(landscape.body).toContain('width="910" height="550"');
  expect(landscape.body).not.toBe(first.body);
  expect(render).toHaveBeenCalledTimes(4);
  const landscapeHead = await request(
    "/github-devcard/api/devcard?username=SVG-USER&layout=landscape",
    "HEAD",
  );
  expect(landscapeHead.body).toBe("");
  expect(landscapeHead.headers).toEqual(landscape.headers);
  expect(render).toHaveBeenCalledTimes(4);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("rate limits uncached profiles by Cloudflare IP before contacting GitHub", async () => {
  const upstream = vi.fn(async () => new Response("{}", { status: 404 }));
  vi.stubGlobal("fetch", upstream);
  limit.mockResolvedValue({ success: false });
  for (const path of ["/api/profile", "/github-devcard/api/devcard"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await request(`${path}?username=limited-user`, method, "", {
        "CF-Connecting-IP": "192.0.2.1",
        "X-Forwarded-For": "198.51.100.1",
      });
      expect(response.status).toBe(429);
      expect(response.headers["retry-after"]).toBe("60");
      expect(response.headers["cache-control"]).toBe("no-store");
      if (method === "HEAD") expect(response.body).toBe("");
      else expect(JSON.parse(response.body).error).toContain("Too many profile requests");
    }
  }
  expect(limit).toHaveBeenCalledWith({ key: "profile:192.0.2.1" });
  expect(upstream).not.toHaveBeenCalled();
  expect(cache.put).not.toHaveBeenCalled();
  await request("/api/profile?username=limited-user");
  expect(limit).toHaveBeenLastCalledWith({ key: "profile:unknown" });
});

test("cached profiles and cards remain available after the rate limit is reached", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        login: "cached-user",
        name: "Cached User",
        bio: null,
        id: 1,
        public_repos: 1,
        followers: 1,
        created_at: "2020-01-01T00:00:00Z",
      }),
    ),
  );
  expect((await request("/api/devcard?username=cached-user")).status).toBe(200);
  expect(limit).toHaveBeenCalledTimes(1);
  limit.mockResolvedValue({ success: false });
  for (const path of [
    "/api/profile?username=cached-user",
    "/api/devcard?username=cached-user",
    "/api/devcard?username=cached-user&theme=paper",
  ])
    expect((await request(path)).status).toBe(200);
  expect(limit).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await request("/api/devcard?username=other-user")).status).toBe(429);
});

test("failed GitHub lookups consume limits and organization lookups are also checked", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  for (let i = 0; i < 2; i++)
    expect((await request("/api/profile?username=missing-user")).status).toBe(404);
  expect(limit).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(2);

  cachedProfiles.set(
    "http://localhost/__profile-cache/v1/cached-user",
    Response.json({
      user: { login: "cached-user" },
      avatar: "",
    }),
  );
  limit.mockResolvedValue({ success: false });
  expect((await request("/api/devcard?username=cached-user&org=other-org")).status).toBe(429);
  expect(fetch).toHaveBeenCalledTimes(2);
});
