import { test, expect } from "vite-plus/test";
import { escapeXml, renderDevcard, themes } from "../src/devcard.ts";

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
  expect(Object.keys(patterns).length).toBe(16);
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
  expect(!svg.includes('<rect x="472"')).toBeTruthy();
  expect(Object.keys(themes).length).toBe(18);
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

test("default logo uses the shared card mark in the selected palette", async () => {
  const { renderCardMark } = await import("../src/logo.ts");
  const { default: logo } = await import("../../assets/logo.svg?raw", {
    with: { type: "text" },
  });
  const paths = [...logo.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);
  for (const [key, theme] of Object.entries(themes)) {
    const svg = renderDevcard(user, key);
    expect(svg.includes('<g id="brand-logo">')).toBeTruthy();
    for (const path of paths) expect(svg).toContain(path);
    expect(svg).not.toContain("currentColor");
    expect(svg).not.toContain("var(--paper");
    expect(svg.includes(renderCardMark(theme.foreground, theme.background))).toBeTruthy();
    const custom = renderDevcard(user, key, "", "leaf", "data:image/png;base64,AQID");
    for (const path of paths) expect(custom).not.toContain(path);
  }
});

test("non-square silhouettes keep their proportions and are centered", async () => {
  const { patterns } = await import("../src/patterns.ts");
  expect(patterns.wave.transform).toBe("translate(0 1) scale(1) translate(0 -1)");
  expect(patterns.hexagon.transform).toMatch(/scale\([0-9.e+-]+\)/);
  for (const shape of Object.values(patterns)) {
    // One scale factor applies equally to both axes.
    expect(shape.transform).toMatch(/scale\([0-9.e+-]+\)/);
  }
});

test("avatar dimensions and leaf mask do not depend on the GitHub account", () => {
  const accounts = [
    user,
    { ...user, login: "nuskey8", name: "Yusuke Nakada", bio: "a.k.a @annulusgames", id: 84110981 },
  ];
  const masks = accounts.map((account) => {
    const svg = renderDevcard(account, "sky", "data:image/png;base64,YQ==", "leaf");
    expect(svg).toContain('width="516" height="516" preserveAspectRatio="xMidYMid slice"');
    expect(svg).not.toContain('height="474"');
    return svg.match(/<clipPath id="avatar">(.*?)<\/clipPath>/)?.[1];
  });
  expect(masks[0]).toBeDefined();
  expect(masks[0]).toBe(masks[1]);
});

test("biography wraps without truncating Latin or Japanese text", () => {
  for (const bio of [
    "A developer building thoughtful tools and open source projects. ".repeat(2).trim(),
    "開発者として使いやすいソフトウェアを作っています。".repeat(5),
  ]) {
    const svg = renderDevcard({ ...user, name: "Test", bio });
    const lines = [...svg.matchAll(/<tspan x="44" y="([\d.]+)">([^<]*)<\/tspan>/g)];
    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines
        .map((line) => line[2])
        .join("")
        .replace(/\s/g, ""),
    ).toBe(bio.replace(/\s/g, ""));
    expect(Math.max(...lines.map((line) => Number(line[1])))).toBeLessThan(780);
    expect(svg).toContain('font-size="22" font-weight="600" letter-spacing="0"');
  }
});

test("rounded regular hexagon has a horizontal top edge and preserves card height", async () => {
  const { patterns } = await import("../src/patterns.ts");
  expect(patterns.hexagon.path).toMatch(/^M31 0L69 0Q75 0/);
  expect(patterns.hexagon.path.match(/Q/g)).toHaveLength(6);
  const svg = renderDevcard(user, "sky", "data:image/png;base64,YQ==", "hexagon");
  expect(svg).toContain('width="600" height="900"');
  expect(svg).toContain('width="516" height="516" preserveAspectRatio="xMidYMid slice"');
});

test("picker and avatar mask share exactly the same silhouette", async () => {
  const { patterns, renderShape, renderAvatarMask } = await import("../src/patterns.ts");
  for (const key of Object.keys(patterns)) {
    expect(renderShape(key)).toContain(`d="${patterns[key].path}"`);
    expect(renderAvatarMask(key)).toBe(
      `<path d="${patterns[key].path}" transform="translate(42 42) scale(5.16) ${patterns[key].transform}"/>`,
    );
    const svg = renderDevcard(user, "sky", "data:image/png;base64,YQ==", key);
    expect(svg).toContain(`<clipPath id="avatar">${renderAvatarMask(key)}</clipPath>`);
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
    expect(svg).toContain('x="866" y="515" text-anchor="end" font-size="16"');
    const lines = [...svg.matchAll(/<tspan x="480" y="([\d.]+)">([^<]*)<\/tspan>/g)];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((line) => line[2]).join("")).toBe(bio);
    expect(Math.max(...lines.map((line) => Number(line[1])))).toBeLessThan(412);
    expect(svg).not.toContain("NaN");
  }
});

test("landscape biography uses glyph widths rather than wrapping narrow letters early", () => {
  const bio = "i".repeat(60);
  const svg = renderDevcard({ ...user, bio }, "sky", "", "leaf", "", "landscape");
  const lines = [...svg.matchAll(/<tspan x="480" y="([\d.]+)">([^<]*)<\/tspan>/g)];
  expect(lines).toHaveLength(1);
  expect(lines[0][2]).toBe(bio);
  expect(svg).toContain('<text font-size="22"');
});
