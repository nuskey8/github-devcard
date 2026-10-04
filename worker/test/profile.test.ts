import { afterEach, expect, test, vi } from "vite-plus/test";
import { fetchProfile } from "../src/profile.ts";

function mockAvatar(image: Response) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          login: "test-user",
          name: "Test User",
          bio: null,
          id: 1,
          public_repos: 1,
          followers: 1,
          created_at: "2020-01-01T00:00:00Z",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
        }),
      )
      .mockResolvedValueOnce(image),
  );
}

function streamedImage(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const cancel = vi.fn();
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    const next = chunks.shift();
    if (next) controller.enqueue(next);
    else controller.close();
  });
  const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
  return {
    image: new Response(body, { headers: { "Content-Type": "image/png", ...headers } }),
    cancel,
    pull,
  };
}

afterEach(() => vi.unstubAllGlobals());

test("cancels before reading when Content-Length reaches the limit", async () => {
  for (const length of [2_000_000, 3_000_000]) {
    const { image, cancel, pull } = streamedImage([new Uint8Array([1])], {
      "Content-Length": String(length),
    });
    mockAvatar(image);
    const profile = await fetchProfile("test-user");
    expect(profile.avatar).toBe("");
    expect(profile.user.login).toBe("test-user");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  }
});

test("cancels as soon as streamed bytes reach the limit regardless of Content-Length", async () => {
  const headerVariants: Record<string, string>[] = [{}, { "Content-Length": "3" }];
  for (const headers of headerVariants) {
    for (const lastSize of [1_000_000, 1_000_001]) {
      const { image, cancel, pull } = streamedImage(
        [new Uint8Array(1_000_000), new Uint8Array(lastSize), new Uint8Array([1])],
        headers,
      );
      mockAvatar(image);
      expect((await fetchProfile("test-user")).avatar).toBe("");
      expect(pull).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledOnce();
    }
  }
});

test("embeds multi-chunk avatars just below the size limit", async () => {
  const { image, cancel } = streamedImage([new Uint8Array(1_000_000), new Uint8Array(999_999)]);
  mockAvatar(image);
  expect((await fetchProfile("test-user")).avatar).toMatch(/^data:image\/png;base64,/);
  expect(cancel).not.toHaveBeenCalled();
});

test("discards and cancels unsupported or malformed image responses", async () => {
  for (const mime of ["image/svg+xml", "invalid", ""]) {
    const { image, cancel, pull } = streamedImage([new Uint8Array([1])], {
      "Content-Type": mime,
    });
    mockAvatar(image);
    expect((await fetchProfile("test-user")).avatar).toBe("");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  }
});

test("extended statistics count every public repository page and authored public PRs", async () => {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer test-token" }));
    if (url.pathname === "/users/test-user")
      return Response.json({
        login: "test-user",
        name: "Test User",
        bio: null,
        id: 1,
        public_repos: 102,
        followers: 30,
        created_at: "2020-01-01T00:00:00Z",
      });
    if (url.pathname === "/users/test-user/repos") {
      expect(url.searchParams.get("type")).toBe("owner");
      expect(url.searchParams.get("per_page")).toBe("100");
      return url.searchParams.get("page") === "1"
        ? Response.json(
            [
              { stargazers_count: 12, private: false },
              { stargazers_count: 999, private: true },
            ],
            {
              headers: {
                Link: '<https://api.github.com/users/test-user/repos?page=2>; rel="next"',
              },
            },
          )
        : Response.json([{ stargazers_count: 8, private: false }]);
    }
    expect(url.pathname).toBe("/search/issues");
    expect(url.searchParams.get("q")).toBe("is:pr author:test-user is:public");
    return Response.json({ total_count: 1234, incomplete_results: false });
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await fetchProfile("test-user", "test-token", [
    "repos",
    "stars",
    "prs",
    "followers",
  ]);
  expect(result.user.stars).toBe(20);
  expect(result.user.pull_requests).toBe(1234);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("selections fetch only their required statistics and reject incomplete PR counts", async () => {
  for (const stats of [[], ["stars"], ["prs", "stars"]] as const) {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/repos"))
        return Response.json([{ stargazers_count: 0, private: false }]);
      if (url.pathname === "/search/issues")
        return Response.json({ total_count: 5, incomplete_results: true });
      return Response.json({
        login: "test-user",
        name: null,
        bio: null,
        id: 1,
        public_repos: 1,
        followers: 0,
        created_at: "2020-01-01T00:00:00Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    if (stats.length === 2)
      await expect(fetchProfile("test-user", undefined, stats)).rejects.toMatchObject({
        status: 502,
      });
    else {
      const result = await fetchProfile("test-user", undefined, stats);
      expect(result.user.pull_requests).toBeUndefined();
      expect(result.user.stars).toBe(stats.length === 1 ? 0 : undefined);
    }
    expect(fetchMock).toHaveBeenCalledTimes(stats.length === 0 ? 1 : stats.length === 1 ? 2 : 3);
  }
});

test("issues and commits count authored public activity using separate search endpoints", async () => {
  const queries: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/users/test-user")
        return Response.json({
          login: "test-user",
          name: null,
          bio: null,
          id: 1,
          public_repos: 1,
          followers: 0,
          created_at: "2020-01-01T00:00:00Z",
        });
      const query = url.searchParams.get("q")!;
      queries.push(query);
      expect(url.searchParams.get("per_page")).toBe("1");
      if (url.pathname === "/search/commits") {
        expect(query).toBe("author:test-user is:public");
        return Response.json({ total_count: 12000, incomplete_results: false });
      }
      expect(url.pathname).toBe("/search/issues");
      expect(query).toBe("is:issue author:test-user is:public");
      return Response.json({ total_count: 42, incomplete_results: false });
    }),
  );
  const result = await fetchProfile("test-user", undefined, ["issues", "commits"]);
  expect(result.user.issues).toBe(42);
  expect(result.user.commits).toBe(12000);
  expect(result.user.stars).toBeUndefined();
  expect(result.user.pull_requests).toBeUndefined();
  expect(queries).toHaveLength(2);
});
