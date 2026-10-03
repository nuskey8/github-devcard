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

test("embeds avatars smaller than the limit, including multiple chunks", async () => {
  const { image, cancel } = streamedImage([new Uint8Array([1, 2]), new Uint8Array([3])]);
  mockAvatar(image);
  expect((await fetchProfile("test-user")).avatar).toBe("data:image/png;base64,AQID");
  expect(cancel).not.toHaveBeenCalled();
});

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

test("accepts the last byte below the limit", async () => {
  const { image, cancel } = streamedImage([new Uint8Array(1_999_999)]);
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

test("avatar stream failures preserve the readable profile fallback", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.error(new Error("Interrupted"));
    },
  });
  mockAvatar(new Response(body, { headers: { "Content-Type": "image/png" } }));
  const profile = await fetchProfile("test-user");
  expect(profile.avatar).toBe("");
  expect(profile.user.login).toBe("test-user");
});
