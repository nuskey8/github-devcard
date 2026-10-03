import { Buffer } from "node:buffer";
import { parse as parseContentType } from "content-type";
import type { GitHubUser } from "./devcard.ts";

export interface CachedProfile {
  user: GitHubUser;
  avatar: string;
}

export async function fetchProfile(username: string, token?: string): Promise<CachedProfile> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "github-devcard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const status =
      response.status === 404
        ? 404
        : response.status === 403 || response.status === 429
          ? 429
          : 502;

    throw Object.assign(
      new Error(
        status === 404
          ? "User not found."
          : status === 429
            ? "GitHub rate limit reached. Try again later."
            : "Unable to fetch the GitHub profile.",
      ),
      { status },
    );
  }

  const user = (await response.json()) as GitHubUser;
  let avatar = "";
  try {
    const url = new URL(user.avatar_url || "");
    if (url.hostname === "avatars.githubusercontent.com") {
      url.searchParams.set("s", "1024");
      const image = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const mime = parseContentType(image.headers.get("content-type") || "").type;
      if (image.ok && ["image/png", "image/jpeg", "image/webp"].includes(mime || "")) {
        const bytes = Buffer.from(await image.arrayBuffer());
        if (bytes.length < 2_000_000) avatar = `data:${mime};base64,${bytes.toString("base64")}`;
      }
    }
  } catch {
    /* A readable initial remains if the avatar is unavailable. */
  }

  return {
    user: {
      login: user.login,
      name: user.name,
      bio: user.bio,
      id: user.id,
      public_repos: user.public_repos,
      followers: user.followers,
      created_at: user.created_at,
    },
    avatar,
  };
}
