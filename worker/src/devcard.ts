import pixelWidth from "string-pixel-width";
import { renderCardMark } from "./logo.ts";
import { renderAvatarMask } from "./patterns.ts";
import { themes } from "./themes.ts";

export { themes } from "./themes.ts";

export const cardLayouts = {
  portrait: { label: "Portrait", width: 600, height: 900 },
  landscape: { label: "Landscape", width: 910, height: 550 },
} as const;

export type CardLayout = keyof typeof cardLayouts;

export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  id: number;
  public_repos: number;
  followers: number;
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

function short(value: string | null, length: number) {
  const chars = Array.from(value || "");
  return chars.length > length ? chars.slice(0, length - 1).join("") + "…" : chars.join("");
}

function characterWidth(char: string, fontSize: number, bold = false): number {
  return char.codePointAt(0)! > 255
    ? fontSize
    : pixelWidth(char, { font: "arial", size: fontSize, bold });
}

function textWidth(value: string, fontSize: number, bold = false): number {
  return Array.from(value).reduce((total, char) => total + characterWidth(char, fontSize, bold), 0);
}

function wrapBio(value: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  let width = 0;

  for (const word of value.trim().split(/\s+/u)) {
    const wordWidth = textWidth(word, fontSize);

    if (line && width + characterWidth(" ", fontSize) + wordWidth > maxWidth) {
      lines.push(line);
      line = "";
      width = 0;
    }

    if (line) {
      line += " ";
      width += characterWidth(" ", fontSize);
    }

    for (const char of word) {
      const charWidth = characterWidth(char, fontSize);
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
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize = 18,
): string {
  if (!value?.trim()) return "";

  let lines = wrapBio(value, fontSize, width);
  while (fontSize > 10 && lines.length * fontSize * 1.4 > height) {
    fontSize -= 0.5;
    lines = wrapBio(value, fontSize, width);
  }

  return `<text font-size="${fontSize}" fill="${color}">${lines.map((line, index) => `<tspan x="${x}" y="${y + index * fontSize * 1.4}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

export function renderDevcard(
  user: GitHubUser,
  theme = "sky",
  avatar = "",
  pattern = "leaf",
  logo = "",
  layout: CardLayout = "portrait",
) {
  const t = Object.hasOwn(themes, theme) ? themes[theme] : themes.sky;
  const landscape = layout === "landscape";
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
        statsY: 790,
        logoX: 492,
        logoY: 790,
        footerY: 865,
      };
  const mask = renderAvatarMask(pattern, geometry.avatarSize, geometry.avatarY);
  const name = short(user.name || user.login, 28);
  const nameSize = landscape
    ? Math.min(46, (geometry.logoX - geometry.textX - 16) / textWidth(name, 1, true))
    : Array.from(user.name || user.login).length > 19
      ? 32
      : 46;
  const usernameSize = landscape
    ? Math.min(26, geometry.bioWidth / textWidth(`@${user.login}`, 1, true))
    : 22;
  const e = escapeXml;
  const year = new Date(user.created_at).getUTCFullYear();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${e(user.login)} · GitHub DevCard</title><desc id="desc">GitHub profile: ${e(user.name || user.login)}, ${user.public_repos} repositories, ${user.followers} followers</desc>
  <defs><clipPath id="avatar">${mask}</clipPath><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="${t.foreground}" stroke-width="1.5"/></pattern></defs>
  <rect width="${width}" height="${height}" rx="16" fill="${t.background}"/>
  <g id="avatar-shape" fill="${t.accent}">${mask}</g>
  ${avatar ? `<image href="${e(avatar)}" x="42" y="${geometry.avatarY}" width="${geometry.avatarSize}" height="${geometry.avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>` : `<text x="${42 + geometry.avatarSize / 2}" y="${geometry.avatarY + geometry.avatarSize / 2 + 30}" font-family="Arial,sans-serif" font-size="180" text-anchor="middle" fill="${t.background}">${e(user.login[0].toUpperCase())}</text>`}
  <g font-family="Arial, Helvetica, sans-serif" fill="${t.foreground}">
  <text x="${landscape ? geometry.textX : 42}" y="${geometry.nameY}" font-size="${nameSize}" font-weight="800"${landscape ? ' dominant-baseline="central"' : ""}>${e(name)}</text>
  <text x="${geometry.textX}" y="${geometry.usernameY}" font-size="${usernameSize}" font-weight="600" letter-spacing="0">@${e(user.login)}</text>
  ${biography(user.bio, t.muted, geometry.textX, geometry.bioY, geometry.bioWidth, geometry.bioHeight, landscape ? 22 : 18)}
  <g transform="translate(${geometry.statsX} ${geometry.statsY})"><rect width="${landscape ? width - 44 - geometry.statsX : 340}" height="40" rx="8" fill="none" stroke="${t.line}" stroke-width="2"/><text x="13" y="${landscape ? 28 : 26}" font-size="${landscape ? 20 : 17}" font-weight="700">${Number(user.public_repos).toLocaleString("en-US")} repos</text><rect x="132" width="24" height="40" fill="url(#hatch)" stroke="${t.line}" stroke-width="2"/><text x="169" y="${landscape ? 28 : 26}" font-size="${landscape ? 20 : 17}" font-weight="700">${Number(user.followers).toLocaleString("en-US")} followers</text></g>
  <g id="brand-logo">${logo ? `<image href="${e(logo)}" x="${geometry.logoX}" y="${geometry.logoY}" width="64" height="40" preserveAspectRatio="xMidYMid meet"/>` : `<g transform="translate(${geometry.logoX} ${geometry.logoY})">${renderCardMark(t.foreground, t.background)}</g>`}</g>
  <text x="44" y="${geometry.footerY}" font-size="16" letter-spacing="1" fill="${t.muted}">GitHub DevCard / Member since ${year}</text><text x="${width - 44}" y="${geometry.footerY}" text-anchor="end" font-size="16" fill="${t.muted}">NO. ${e(user.id)}</text>
  </g></svg>`;
}
