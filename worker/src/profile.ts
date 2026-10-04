import { Buffer } from "node:buffer";
import { parse as parseContentType } from "content-type";
import { defaultStats, type GitHubUser, type CardMetric } from "./devcard.ts";

export interface CachedProfile {
  user: GitHubUser;
  avatar: string;
}

const MAX_AVATAR_BYTES = 2_000_000;

async function readAvatar(image: Response): Promise<Buffer | null> {
  if (!image.body) return null;
  const reader = image.body.getReader();
  let complete = false;
  try {
    if (Number(image.headers.get("content-length")) >= MAX_AVATAR_BYTES) return null;

    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        return Buffer.concat(chunks, size);
      }

      size += value.byteLength;
      if (size >= MAX_AVATAR_BYTES) return null;

      chunks.push(value);
    }
  } finally {
    if (!complete) await reader.cancel();
    reader.releaseLock();
  }
}

export async function fetchProfile(
  username: string,
  token?: string,
  stats: readonly CardMetric[] = defaultStats,
): Promise<CachedProfile> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "github-devcard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function github(path: string) {
    const response = await fetch(`https://api.github.com${path}`, {
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
    return response;
  }

  const response = await github(`/users/${encodeURIComponent(username)}`);

  const user = (await response.json()) as GitHubUser;
  let avatar = "";
  try {
    const url = new URL(user.avatar_url || "");
    if (url.hostname === "avatars.githubusercontent.com") {
      url.searchParams.set("s", "1024");
      const image = await fetch(url, { signal: AbortSignal.timeout(8000) });
      try {
        const mime = parseContentType(image.headers.get("content-type") || "").type;
        if (image.ok && ["image/png", "image/jpeg", "image/webp"].includes(mime)) {
          const bytes = await readAvatar(image);
          if (bytes) avatar = `data:${mime};base64,${bytes.toString("base64")}`;
        }
      } finally {
        if (image.body && !image.body.locked) await image.body.cancel();
      }
    }
  } catch {
    /* A readable initial remains if the avatar is unavailable. */
  }

  const metrics = stats;
  async function stars() {
    let total = 0;
    for (let page = 1; ; page++) {
      const response = await github(
        `/users/${encodeURIComponent(user.login)}/repos?type=owner&per_page=100&page=${page}`,
      );
      const repos = (await response.json()) as { stargazers_count: number; private: boolean }[];
      total += repos
        .filter((repo) => !repo.private)
        .reduce((sum, repo) => sum + repo.stargazers_count, 0);
      if (!response.headers.get("link")?.includes('rel="next"')) return total;
    }
  }
  async function searchCount(metric: "prs" | "issues" | "commits") {
    const query = new URLSearchParams({
      q: `${metric === "commits" ? "" : `is:${metric === "prs" ? "pr" : "issue"} `}author:${user.login} is:public`,
      per_page: "1",
    });
    const response = await github(
      `/search/${metric === "commits" ? "commits" : "issues"}?${query}`,
    );
    const result = (await response.json()) as { total_count: number; incomplete_results: boolean };
    if (result.incomplete_results)
      throw Object.assign(new Error("GitHub statistics are temporarily incomplete. Try again."), {
        status: 502,
      });
    return result.total_count;
  }
  const [starCount, prCount, issueCount, commitCount] = await Promise.all([
    metrics.includes("stars") ? stars() : undefined,
    metrics.includes("prs") ? searchCount("prs") : undefined,
    metrics.includes("issues") ? searchCount("issues") : undefined,
    metrics.includes("commits") ? searchCount("commits") : undefined,
  ]);

  return {
    user: {
      login: user.login,
      name: user.name,
      bio: user.bio,
      id: user.id,
      public_repos: user.public_repos,
      followers: user.followers,
      ...(starCount === undefined ? {} : { stars: starCount }),
      ...(prCount === undefined ? {} : { pull_requests: prCount }),
      ...(issueCount === undefined ? {} : { issues: issueCount }),
      ...(commitCount === undefined ? {} : { commits: commitCount }),
      created_at: user.created_at,
    },
    avatar,
  };
}
