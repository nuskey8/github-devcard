import { BookOpen, Users, Star, GitPullRequest, CircleDot, GitCommitHorizontal, type IconNode } from "lucide";
import { parse, type Font, type Path } from "opentype.js";
import { renderCardMark } from "./logo.ts";
import { renderAvatarMask } from "./patterns.ts";
import { themes } from "./themes.ts";

export { themes } from "./themes.ts";

export const cardLayouts = {
  portrait: { label: "Portrait", width: 600, height: 900 },
  landscape: { label: "Landscape", width: 910, height: 550 },
} as const;

export type CardLayout = keyof typeof cardLayouts;

export const statLabels = {
  repos: "Repos",
  followers: "Followers",
  stars: "Stars",
  prs: "PRs",
  issues: "Issues",
  commits: "Commits",
} as const;
export type CardMetric = keyof typeof statLabels;
export const defaultStats: CardMetric[] = ["repos", "followers"];
export function selectedStats(value: string): CardMetric[] {
  return (Object.keys(statLabels) as CardMetric[]).filter((metric) =>
    value.split(",").includes(metric),
  );
}

const statIconNodes: Record<CardMetric, IconNode> = {
  repos: BookOpen,
  followers: Users,
  stars: Star,
  prs: GitPullRequest,
  issues: CircleDot,
  commits: GitCommitHorizontal,
};
export const statIcons = Object.fromEntries(
  Object.entries(statIconNodes).map(([metric, nodes]) => [
    metric,
    nodes.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${escapeXml(value)}"`).join(" ")}/>`).join(""),
  ]),
) as Record<CardMetric, string>;

export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  id: number;
  public_repos: number;
  followers: number;
  stars?: number;
  pull_requests?: number;
  issues?: number;
  commits?: number;
  created_at: string;
  avatar_url?: string;
}

export function escapeXml(value: string | number | null | undefined) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      (
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }) as Record<
          string,
          string
        >
      )[c],
  );
}

export interface CardTextOptions {
  bold?: boolean;
  anchor?: "middle" | "end";
  central?: boolean;
  spacing?: number;
  fill?: string;
}

export interface CardTypography {
  width(value: string, size: number, bold?: boolean): number;
  text(value: string, x: number, y: number, size: number, options?: CardTextOptions): string;
}

export type CardTypographyLoader = (
  value: string,
  loadBytes?: FontBytesLoader,
) => Promise<CardTypography>;
type FontBytesLoader = (path: string) => Promise<ArrayBuffer>;

function pathData(path: Path): string {
  // Serialize numerically: opentype's exponent-based rounding can produce NaN
  // for coordinates infinitesimally above an integer (e.g. 42.00000000000001).
  const coordinates = (...values: number[]) =>
    values.map((value) => Number(value.toFixed(2))).join(" ");
  return path.commands
    .map((command) => {
      switch (command.type) {
        case "M":
        case "L":
          return command.type + coordinates(command.x, command.y);
        case "Q":
          return "Q" + coordinates(command.x1, command.y1, command.x, command.y);
        case "C":
          return (
            "C" + coordinates(command.x1, command.y1, command.x2, command.y2, command.x, command.y)
          );
        case "Z":
          return "Z";
      }
    })
    .join("");
}

function typography(regular: Font, bold: Font, japanese?: [Font, Font]): CardTypography {
  const fontFor = (char: string, heavy: boolean) => {
    const latin = heavy ? bold : regular;
    return latin.hasChar(char) ? latin : japanese?.[heavy ? 1 : 0] || latin;
  };
  const width: CardTypography["width"] = (value, size, heavy = false) =>
    Array.from(value).reduce((total, char) => {
      const font = fontFor(char, heavy);
      return total + ((font.charToGlyph(char).advanceWidth || 0) * size) / font.unitsPerEm;
    }, 0);

  return {
    width,
    text(value, x, y, size, options = {}) {
      const { bold: heavy = false, spacing = 0, anchor, central, fill } = options;
      const chars = Array.from(value);
      const advance = width(value, size, heavy) + Math.max(0, chars.length - 1) * spacing;
      let cursor = x - (anchor === "middle" ? advance / 2 : anchor === "end" ? advance : 0);
      // Center the name using Overused Grotesk's capital height, rather than OS baseline rules.
      const font = heavy ? bold : regular;
      const baseline =
        y +
        (central ? (font.charToGlyph("H").getBoundingBox().y2 * size) / font.unitsPerEm / 2 : 0);
      const paths = chars
        .map((char) => {
          const selected = fontFor(char, heavy);
          const glyph = selected.charToGlyph(char);
          const path = pathData(glyph.getPath(cursor, baseline, size, undefined, selected));
          cursor += ((glyph.advanceWidth || 0) * size) / selected.unitsPerEm + spacing;
          return path;
        })
        .join(" ");
      return `<g aria-label="${escapeXml(value)}" data-x="${x}" data-y="${y}" data-font-size="${size}"${fill ? ` fill="${escapeXml(fill)}"` : ""}><path d="${paths}"/></g>`;
    },
  };
}

export function createCardTypographyLoader(loadBytes: FontBytesLoader): CardTypographyLoader {
  // Share only fixed font resources. Failed loads are evicted so a later request can retry.
  const fonts = new Map<string, Promise<Font>>();
  function load(name: string, loader: FontBytesLoader) {
    let promise = fonts.get(name);
    if (!promise) {
      promise = loader(`/github-devcard/fonts/${name}.woff`)
        .then((bytes) => parse(bytes, { lowMemory: true }))
        .catch((error: unknown) => {
          fonts.delete(name);
          throw error;
        });
      fonts.set(name, promise);
    }
    return promise;
  }
  return async (value, loader = loadBytes) => {
    const [regular, bold] = await Promise.all([
      load("OverusedGrotesk-Roman", loader),
      load("OverusedGrotesk-Bold", loader),
    ]);
    // Latin-only cards never need to download the larger Japanese fonts.
    const needsJapanese = Array.from(value).some(
      (char) => !regular.hasChar(char) || !bold.hasChar(char),
    );
    const japanese: [Font, Font] | undefined = needsJapanese
      ? await Promise.all([load("NotoSansJP-Regular", loader), load("NotoSansJP-Bold", loader)])
      : undefined;
    return typography(regular, bold, japanese);
  };
}

export const loadCardTypography = createCardTypographyLoader(async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Unable to load card fonts.");
  return response.arrayBuffer();
});

function short(value: string | null, length: number) {
  const chars = Array.from(value || "");
  return chars.length > length ? chars.slice(0, length - 1).join("") + "…" : chars.join("");
}

function wrapBio(
  value: string,
  fontSize: number,
  maxWidth: number,
  typography: CardTypography,
): string[] {
  const lines: string[] = [];
  let line = "";
  let width = 0;

  for (const word of value.trim().split(/\s+/u)) {
    const wordWidth = typography.width(word, fontSize);

    if (line && width + typography.width(" ", fontSize) + wordWidth > maxWidth) {
      lines.push(line);
      line = "";
      width = 0;
    }

    if (line) {
      line += " ";
      width += typography.width(" ", fontSize);
    }

    for (const char of word) {
      const charWidth = typography.width(char, fontSize);
      if (line && width + charWidth > maxWidth) {
        lines.push(line);
        line = "";
        width = 0;
      }
      line += char;
      width += charWidth;
    }
  }

  if (line) lines.push(line);
  return lines;
}
function biography(
  value: string | null,
  typography: CardTypography,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize = 18,
): string {
  if (!value?.trim()) return "";

  let lines = wrapBio(value, fontSize, width, typography);
  while (fontSize > 10 && lines.length * fontSize * 1.4 > height) {
    fontSize -= 0.5;
    lines = wrapBio(value, fontSize, width, typography);
  }

  return lines
    .map((line, index) =>
      typography.text(line, x, y + index * fontSize * 1.4, fontSize, { fill: color }),
    )
    .join("");
}

export function renderDevcard(
  user: GitHubUser,
  theme = "sky",
  avatar = "",
  pattern = "leaf",
  logo = "",
  layout: CardLayout = "portrait",
  typography: CardTypography,
  stats: readonly CardMetric[] = defaultStats,
) {
  const t = Object.hasOwn(themes, theme) ? themes[theme] : themes.sky;
  const landscape = layout === "landscape";
  const metrics = stats;
  const compact = metrics.length > 3;
  const { width, height } = cardLayouts[layout];
  const geometry = landscape
    ? {
        avatarSize: 380,
        avatarY: 72,
        textX: 480,
        nameY: 96,
        usernameY: 155,
        bioY: 199,
        bioWidth: 386,
        bioHeight: 180,
        statsX: 480,
        statsY: 412,
        logoX: 802,
        logoY: 76,
        footerY: 515,
      }
    : {
        avatarSize: 516,
        avatarY: 42,
        textX: 44,
        nameY: 635,
        usernameY: 678,
        bioY: 717,
        bioWidth: 512,
        bioHeight: 64,
        statsX: 42,
        statsY: compact ? 782 : 790,
        logoX: 492,
        logoY: 790,
        footerY: 865,
      };
  const mask = renderAvatarMask(pattern, geometry.avatarSize, geometry.avatarY);
  const name = short(user.name || user.login, 28);
  const nameSize = landscape
    ? Math.min(46, (geometry.logoX - geometry.textX - 16) / typography.width(name, 1, true))
    : Array.from(user.name || user.login).length > 19
      ? 32
      : 46;
  const usernameSize = landscape
    ? Math.min(26, geometry.bioWidth / typography.width(`@${user.login}`, 1, true))
    : 22;
  const e = escapeXml;
  const year = new Date(user.created_at).getUTCFullYear();
  const values = {
    repos: user.public_repos,
    followers: user.followers,
    stars: user.stars,
    prs: user.pull_requests,
    issues: user.issues,
    commits: user.commits,
  };
  const labels = {
    repos: "repositories",
    followers: "followers",
    stars: "stars received",
    prs: "public pull requests authored",
    issues: "public issues authored",
    commits: "public commits authored on default branches",
  };
  const statsWidth = landscape ? width - 44 - geometry.statsX : 340;
  const columns = Math.max(1, metrics.length);
  const dividerWidth = compact ? 0 : columns === 2 ? 32 : 20;
  const cellWidth = (statsWidth - dividerWidth * (columns - 1)) / columns;
  const statItems = metrics
    .map((metric, index) => {
      const x = index * (cellWidth + dividerWidth);
      const y = 0;
      const value = values[metric];
      const number =
        value === undefined
          ? "—"
          : new Intl.NumberFormat("en-US", {
              notation: metrics.length > 2 ? "compact" : "standard",
              maximumFractionDigits: 1,
            }).format(value);
      const fontSize = Math.min(
        landscape ? 20 : 17,
        (cellWidth - (compact ? 8 : 43)) / Math.max(typography.width(number, 1, true), 1),
      );
      if (compact) {
        const center = x + cellWidth / 2;
        return `<g data-stat="${metric}" aria-label="${e(value ?? "Unavailable")} ${labels[metric]}"><title>${labels[metric]}</title><g transform="translate(${center - 9} 9) scale(0.75)" fill="none" stroke="${t.foreground}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${statIcons[metric]}</g>${typography.text(number, center, 46, fontSize, { bold: true, anchor: "middle" })}</g>${index < columns - 1 ? `<path d="M${x + cellWidth} 8v38" stroke="${t.line}" stroke-width="1"/>` : ""}`;
      }
      return `<g data-stat="${metric}" transform="translate(0 ${y})" aria-label="${e(value ?? "Unavailable")} ${labels[metric]}"><title>${labels[metric]}</title><g transform="translate(${x + 10} 10) scale(0.8333)" fill="none" stroke="${t.foreground}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${statIcons[metric]}</g>${typography.text(number, x + 38, 26, fontSize, { bold: true })}</g>${index % columns < columns - 1 && index < metrics.length - 1 ? `<rect x="${x + cellWidth}" width="${dividerWidth}" height="40" y="${y}" fill="url(#hatch)" stroke="${t.line}" stroke-width="2"/>` : ""}`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${e(user.login)} · GitHub DevCard</title><desc id="desc">GitHub profile: ${e(user.name || user.login)}, ${metrics.map((metric) => `${e(values[metric] ?? "Unavailable")} ${labels[metric]}`).join(", ")}</desc>
  <defs><clipPath id="avatar">${mask}</clipPath><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="${t.foreground}" stroke-width="1.5"/></pattern></defs>
  <rect width="${width}" height="${height}" rx="16" fill="${t.background}"/>
  <g id="avatar-shape" fill="${t.accent}">${mask}</g>
  ${avatar ? `<image href="${e(avatar)}" x="42" y="${geometry.avatarY}" width="${geometry.avatarSize}" height="${geometry.avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>` : typography.text(user.login[0].toUpperCase(), 42 + geometry.avatarSize / 2, geometry.avatarY + geometry.avatarSize / 2 + 30, 180, { anchor: "middle", fill: t.background })}
  <g fill="${t.foreground}">
  ${typography.text(name, landscape ? geometry.textX : 42, geometry.nameY, nameSize, { bold: true, central: landscape })}
  ${typography.text(`@${user.login}`, geometry.textX, geometry.usernameY, usernameSize, { bold: true })}
  ${biography(user.bio, typography, t.muted, geometry.textX, geometry.bioY, geometry.bioWidth, geometry.bioHeight, landscape ? 22 : 18)}
  ${metrics.length ? `<g id="stats" transform="translate(${geometry.statsX} ${geometry.statsY})"><rect width="${statsWidth}" height="${compact ? 54 : 40}" rx="8" fill="none" stroke="${t.line}" stroke-width="2"/>${statItems}</g>` : ""}
  <g id="brand-logo">${logo ? `<image href="${e(logo)}" x="${geometry.logoX}" y="${geometry.logoY}" width="64" height="40" preserveAspectRatio="xMidYMid meet"/>` : `<g transform="translate(${geometry.logoX + (landscape ? 6.4 : 0)} ${geometry.logoY + (landscape ? 4 : 0)})${landscape ? " scale(0.8)" : ""}">${renderCardMark(t.foreground, t.background)}</g>`}</g>
  ${typography.text(`GitHub DevCard / Member since ${year}`, 44, geometry.footerY, 16, { spacing: 1, fill: t.muted })}${typography.text(`NO. ${user.id}`, width - 44, geometry.footerY, 16, { anchor: "end", fill: t.muted })}
  </g></svg>`;
}
