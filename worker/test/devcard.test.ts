import { test, expect, beforeAll, vi } from "vite-plus/test";
import {
  escapeXml,
  createCardTypographyLoader,
  type CardTypography,
  renderDevcard as renderWithFonts,
  themes,
  type GitHubUser,
  type CardLayout,
  statLabels,
  type CardMetric,
} from "../src/devcard.ts";
import { readFile } from "node:fs/promises";

async function readFont(path: string): Promise<ArrayBuffer> {
  const bytes = await readFile(
    new URL(`../../site/public${path.replace("/github-devcard", "")}`, import.meta.url),
  );
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
const loadTestTypography = createCardTypographyLoader(readFont);

let typography: CardTypography;
beforeAll(async () => {
  typography = await loadTestTypography("日本語");
});

function renderDevcard(
  user: GitHubUser,
  theme?: string,
  avatar?: string,
  pattern?: string,
  logo?: string,
  layout?: CardLayout,
  stats?: readonly CardMetric[],
) {
  return renderWithFonts(user, theme, avatar, pattern, logo, layout, typography, stats);
}

const user = {
  login: "octocat",
  name: '<script>alert("x")</script>',
  bio: "A & B",
  id: 1,
  public_repos: 8,
  followers: 1234,
  created_at: "2011-01-25T00:00:00Z",
};

test("escapes GitHub-controlled text inside SVG", () => {
  const svg = renderDevcard(user);
  expect(!svg.includes("<script>")).toBeTruthy();
  expect(svg.includes("&lt;script&gt;")).toBeTruthy();
  expect(svg.includes("A &amp; B")).toBeTruthy();
  expect(escapeXml("\"'<>")).toBe("&quot;&apos;&lt;&gt;");
});

test("all themes generate self-contained SVG with public statistics", () => {
  for (const theme of Object.keys(themes)) {
    const svg = renderDevcard(user, theme, "data:image/png;base64,YQ==");
    expect(svg.includes(themes[theme].background)).toBeTruthy();
    expect(svg.includes("1,234")).toBeTruthy();
    expect(svg.includes("2011")).toBeTruthy();
    expect(svg.includes("data:image/png;base64,YQ==")).toBeTruthy();
    expect(!svg.includes("foreignObject")).toBeTruthy();
  }
});

test("every pattern uses its own mask and keeps the portrait dimensions", async () => {
  const { patterns } = await import("../src/patterns.ts");
  const masks = new Set();
  for (const [key, shape] of Object.entries(patterns)) {
    const svg = renderDevcard(user, "paper", "data:image/png;base64,YQ==", key);
    expect(svg.includes('width="600" height="900" viewBox="0 0 600 900"')).toBeTruthy();
    expect(svg.includes(shape.path)).toBeTruthy();
    expect(svg).toContain(`transform="translate(42 42) scale(5.16) ${shape.transform}"`);
    expect(svg).toContain('width="516" height="516"');
    expect(svg.includes('clip-path="url(#avatar)"')).toBeTruthy();
    masks.add(shape.path);
  }
  expect(masks.size).toBe(Object.keys(patterns).length);
});

test("organization logo replaces the default card mark in the self-contained card", () => {
  const svg = renderDevcard(user, "mint", "", "circle", "data:image/png;base64,AQID");
  expect(svg.includes('x="492" y="790" width="64" height="40"')).toBeTruthy();
  expect(svg.includes("data:image/png;base64,AQID")).toBeTruthy();
  for (const theme of Object.values(themes)) expect(theme.page).toMatch(/^#[a-f0-9]{6}$/i);
});

function luminance(hex: string): number {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test("every palette keeps card text readable", () => {
  for (const theme of Object.values(themes)) {
    for (const ink of [theme.foreground, theme.muted]) {
      const a = luminance(theme.background),
        b = luminance(ink);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(ratio >= 4.5, `${theme.label}: ${ratio.toFixed(2)}:1`).toBeTruthy();
    }
  }
});

test("biography wraps without truncating Latin or Japanese text", () => {
  for (const bio of [
    "A developer building thoughtful tools and open source projects. ".repeat(2).trim(),
    "開発者として使いやすいソフトウェアを作っています。".repeat(5),
  ]) {
    const svg = renderDevcard({ ...user, name: "Test", bio });
    const lines = [
      ...svg.matchAll(
        /<g aria-label="([^"]*)" data-x="44" data-y="([\d.]+)" data-font-size="[\d.]+" fill=/g,
      ),
    ]
      .map((line) => [line[0], line[2], line[1]])
      .filter((line) => Number(line[1]) >= 717 && Number(line[1]) < 790);
    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines
        .map((line) => line[2])
        .join("")
        .replace(/\s/g, ""),
    ).toBe(bio.replace(/\s/g, ""));
    expect(Math.max(...lines.map((line) => Number(line[1])))).toBeLessThan(780);
    expect(svg).toContain('aria-label="@octocat" data-x="44" data-y="678" data-font-size="22"');
  }
});

test("landscape cards keep avatars square and wrap biographies in the right column", async () => {
  const { patterns } = await import("../src/patterns.ts");
  const bio = "開発者として使いやすいソフトウェアを作っています。".repeat(5);
  for (const pattern of Object.keys(patterns)) {
    const svg = renderDevcard(
      { ...user, login: "a".repeat(39), name: "横向きのプロフィールカード", bio },
      "paper",
      "data:image/png;base64,YQ==",
      pattern,
      "data:image/png;base64,AQID",
      "landscape",
    );
    expect(svg).toContain('width="910" height="550" viewBox="0 0 910 550"');
    expect(svg).toContain('width="380" height="380" preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain(`translate(42 72) scale(3.8) ${patterns[pattern].transform}`);
    expect(svg).toContain('x="802" y="76" width="64" height="40"');
    expect(svg).toContain('data-x="866" data-y="515" data-font-size="16"');
    const lines = [
      ...svg.matchAll(
        /<g aria-label="([^"]*)" data-x="480" data-y="([\d.]+)" data-font-size="[\d.]+" fill=/g,
      ),
    ].map((line) => [line[0], line[2], line[1]]);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((line) => line[2]).join("")).toBe(bio);
    expect(Math.max(...lines.map((line) => Number(line[1])))).toBeLessThan(412);
    expect(svg).not.toContain("NaN");
  }
});

test("landscape biography uses glyph widths rather than wrapping narrow letters early", () => {
  const bio = "i".repeat(60);
  const svg = renderDevcard({ ...user, bio }, "sky", "", "leaf", "", "landscape");
  const lines = [
    ...svg.matchAll(
      /<g aria-label="([^"]*)" data-x="480" data-y="([\d.]+)" data-font-size="[\d.]+" fill=/g,
    ),
  ].map((line) => [line[0], line[2], line[1]]);
  expect(lines).toHaveLength(1);
  expect(lines[0][2]).toBe(bio);
  expect(svg).toContain('data-font-size="22"');
});

test("all card text uses self-contained outlines with escaped accessible labels", () => {
  const svg = renderDevcard({ ...user, name: "日本語 & Grotesk", bio: "Hello 日本語" });
  expect(svg).not.toMatch(/<text\b|<tspan\b|font-family|@font-face/);
  expect(svg).toContain('aria-label="日本語 &amp; Grotesk"');
  expect(svg).toContain('aria-label="Hello 日本語"');
  expect(svg).not.toContain("NaN");
  expect(svg).not.toContain("Infinity");
  expect(renderDevcard({ ...user, name: "日本語 & Grotesk", bio: "Hello 日本語" })).toBe(svg);
});

test("statistics selections show only selected metrics as icons in both layouts", () => {
  const profile = {
    ...user,
    stars: 98765,
    pull_requests: 4321,
    issues: 654,
    commits: 12345,
    followers: 1234567,
  };
  for (const layout of ["portrait", "landscape"] as const) {
    for (const selection of [
      [],
      ["stars"],
      ["prs", "stars"],
      Object.keys(statLabels),
    ] as CardMetric[][]) {
      const svg = renderDevcard(profile, "paper", "", "leaf", "", layout, selection);
      const metrics = [...svg.matchAll(/data-stat="([^"]+)"/g)].map((match) => match[1]);
      expect(metrics).toEqual(selection);
      if (!selection.length) expect(svg).not.toContain('id="stats"');
      expect(svg).not.toMatch(/NaN|Infinity|<text\b/);
      expect(svg).not.toContain(" repos</");
      if (selection.length === 6) {
        expect(svg).toContain('aria-label="654 public issues authored"');
        expect(svg).toContain('aria-label="12345 public commits authored on default branches"');
        expect(svg).not.toContain('transform="translate(0 48)"');
        expect(svg).toContain('height="54"');
        expect(svg).toContain('aria-label="98.8K"');
        expect(svg).toContain('aria-label="98765 stars received"');
        expect(svg).toContain('aria-label="4321 public pull requests authored"');
      }
    }
  }
  const unavailable = renderDevcard(user, "paper", "", "leaf", "", "portrait", ["prs", "stars"]);
  expect(unavailable).toContain('aria-label="Unavailable stars received"');
  expect(unavailable).not.toContain('aria-label="0 stars received"');
});

test("font loads are shared and Japanese fonts are only loaded when needed", async () => {
  const bytes = vi.fn(readFont);
  const load = createCardTypographyLoader(bytes);
  const [first, second] = await Promise.all([load("Hello"), load("World")]);
  expect(bytes).toHaveBeenCalledTimes(2);
  expect(first.text("Grotesk", 0, 30, 22)).toBe(second.text("Grotesk", 0, 30, 22));
  expect(bytes.mock.calls.every(([path]) => path.includes("OverusedGrotesk-"))).toBe(true);

  const japanese = await load("こんにちは");
  expect(bytes).toHaveBeenCalledTimes(4);
  await load("日本語");
  expect(bytes).toHaveBeenCalledTimes(4);
  expect(japanese.width("日本語", 22)).toBe(66);
  expect(japanese.text("日", 0, 30, 22)).not.toBe(first.text("日", 0, 30, 22));
  // Adding Japanese coverage must not change the Latin font or its metrics.
  expect(japanese.text("Grotesk", 0, 30, 22)).toBe(first.text("Grotesk", 0, 30, 22));
  expect(japanese.width("Grotesk", 22)).toBe(first.width("Grotesk", 22));
});

test("failed font downloads can be retried", async () => {
  const bytes = vi.fn(readFont).mockRejectedValueOnce(new Error("Font download failed"));
  const load = createCardTypographyLoader(bytes);
  await expect(load("Hello")).rejects.toThrow("Font download failed");
  const typography = await load("Hello");
  expect(typography.width("Hello", 22)).toBeGreaterThan(0);
  expect(typography.text('A & "B" <C>', 0, 30, 22)).toContain(
    'aria-label="A &amp; &quot;B&quot; &lt;C&gt;"',
  );
});
