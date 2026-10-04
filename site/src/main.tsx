import { githubUsernameSchema } from "@github-devcard/worker/validation";
import { render } from "preact";
import { LRUCache } from "lru-cache";
import {
  cardLayouts,
  escapeXml,
  renderDevcard,
  type CardLayout,
} from "@github-devcard/worker/devcard";
import type { CachedProfile } from "@github-devcard/worker/profile";
import { useAtom } from "jotai";
import {
  usernameAtom,
  themeAtom,
  patternAtom,
  layoutAtom,
  orgAtom,
  customLogoAtom,
} from "./state.ts";
import { useEffect, useRef, useState } from "preact/hooks";
import "./style.css";
import { Header } from "./header.tsx";
import { themes } from "@github-devcard/worker/themes";
import { patterns } from "@github-devcard/worker/patterns";

const themeOptions = Object.entries(themes).map(([key, value]) => [key, value.label]);

const profiles = new LRUCache<string, CachedProfile>({
  max: 20,
  ttl: 300_000,
  async fetchMethod(username, _stale, { signal }) {
    const response = await fetch(
      `${import.meta.env.BASE_URL}api/profile?username=${encodeURIComponent(username)}`,
      { signal },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error || "Unable to load the profile.");
    }
    return (await response.json()) as CachedProfile;
  },
});

async function loadProfile(username: string, signal: AbortSignal): Promise<CachedProfile> {
  signal.throwIfAborted();
  // Share in-flight requests so changing styles during loading doesn't refetch the profile.
  const data = await profiles.fetch(username.toLowerCase());
  signal.throwIfAborted();
  if (!data) throw new Error("Unable to load the profile.");
  return data;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [username, setUsername] = useAtom(usernameAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const [pattern, setPattern] = useAtom(patternAtom);
  const [layout, setLayout] = useAtom(layoutAtom);
  const [org, setOrg] = useAtom(orgAtom);
  const [customLogo, setCustomLogo] = useAtom(customLogoAtom);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [devcard, setDevcard] = useState<{
    image: string;
    blob: Blob;
    name: string;
    markdown: string;
    url: string;
    uploaded: boolean;
    layout: CardLayout;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [embedFormat, setEmbedFormat] = useState("markdown");
  const [embedWidth, setEmbedWidth] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const active = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preview = useRef<string | null>(null);

  async function generate(
    nextTheme = theme,
    nextPattern = pattern,
    nextLogo = customLogo,
    nextOrg = org,
    nextLayout = layout,
  ) {
    const name = username.trim().replace(/^@/, "");
    if (!githubUsernameSchema.safeParse(name).success) {
      setMessage("Enter a valid GitHub username.");
      setError(true);
      return;
    }

    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;

    setBusy(true);
    setError(false);
    setMessage("Loading profile…");
    setCopied(false);

    try {
      const path = `${import.meta.env.BASE_URL}api/devcard?username=${encodeURIComponent(name)}&theme=${nextTheme}&pattern=${nextPattern}&layout=${nextLayout}${!nextLogo && nextOrg.trim() ? `&org=${encodeURIComponent(nextOrg.trim())}` : ""}`;
      const { user, avatar } = await loadProfile(name, controller.signal);
      let logo = nextLogo;
      if (!logo && nextOrg.trim()) {
        logo = (await loadProfile(nextOrg.trim(), controller.signal)).avatar;
        if (!logo) throw new Error("Unable to fetch the organization logo.");
      }
      const blob = new Blob(
        [renderDevcard(user, nextTheme, avatar, nextPattern, logo, nextLayout)],
        {
          type: "image/svg+xml",
        },
      );

      if (active.current !== controller) return;

      const image = URL.createObjectURL(blob);
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = image;

      const url = new URL(path, location.origin).href;
      setDevcard({
        image,
        blob,
        name,
        url,
        uploaded: !!nextLogo,
        layout: nextLayout,
        markdown: `[![${name}'s GitHub DevCard](${url})](https://github.com/${encodeURIComponent(name)})`,
      });
      setMessage("");
    } catch (caught) {
      const e = caught as Error;
      if (e.name !== "AbortError" && active.current === controller) {
        setMessage(e.message);
        setError(true);
        setDevcard(null);
      }
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }

  useEffect(() => {
    void generate();
    return () => {
      active.current?.abort();
      clearTimeout(timer.current);
      if (preview.current) URL.revokeObjectURL(preview.current);
    };
  }, []);

  async function upload(file?: File) {
    if (!file) return;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000)
        throw new Error("Choose a PNG, JPEG, or WebP image under 2 MB.");

      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      const data = canvas.toDataURL("image/png");
      setCustomLogo(data);
      await generate(theme, pattern, data);
    } catch (caught) {
      setError(true);
      setMessage((caught as Error).message);
    }
  }

  async function png() {
    if (!devcard) return;
    setSaving(true);
    const url = URL.createObjectURL(devcard.blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth * 2;
      canvas.height = image.naturalHeight * 2;
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error();

      download(blob, `${devcard.name}-devcard.png`);
    } catch {
      setError(true);
      setMessage("Unable to save PNG. Try SVG.");
    } finally {
      URL.revokeObjectURL(url);
      setSaving(false);
    }
  }

  const previewLayout = devcard?.layout ?? layout;
  const dimensions = cardLayouts[previewLayout];
  const width = embedWidth ?? (previewLayout === "landscape" ? 450 : 300);
  const embedCode = devcard
    ? embedFormat === "html"
      ? `<a href="https://github.com/${encodeURIComponent(devcard.name)}"><img src="${escapeXml(devcard.url)}" alt="${escapeXml(`${devcard.name}'s GitHub DevCard`)}" width="${width}"></a>`
      : devcard.markdown
    : "—";

  async function copy() {
    if (!devcard || devcard.uploaded || busy) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
      setMessage("Select the code and copy it manually.");
    }
  }

  return (
    <>
      <Header />
      <main>
        <section class="editor">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <label for="username">GitHub username</label>
            <div class="input-row">
              <span>@</span>
              <input
                id="username"
                value={username}
                onInput={(e) => setUsername(e.currentTarget.value)}
                maxLength={39}
                required
                spellcheck={false}
                autoCapitalize="none"
                autoComplete="off"
                placeholder="octocat"
              />
            </div>
            <fieldset>
              <legend>Layout</legend>
              <div class="layouts">
                {Object.entries(cardLayouts).map(([key, option]) => (
                  <label class="layout-option" key={key}>
                    <input
                      type="radio"
                      name="layout"
                      value={key}
                      checked={layout === key}
                      onChange={() => {
                        const nextLayout = key as CardLayout;
                        setLayout(nextLayout);
                        void generate(theme, pattern, customLogo, org, nextLayout);
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Color</legend>
              <div class="themes">
                {themeOptions.map(([key, label]) => (
                  <label class={`theme ${key}`} key={key} title={label}>
                    <input
                      type="radio"
                      name="theme"
                      value={key}
                      checked={theme === key}
                      onChange={() => {
                        setTheme(key);
                        void generate(key);
                      }}
                    />
                    <span
                      class="swatch"
                      style={{
                        background: `linear-gradient(135deg,${themes[key].background} 0% 40%,${themes[key].foreground} 40% 70%,${themes[key].page} 70% 100%)`,
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset class="pattern-field">
              <legend>Shape</legend>
              <div class="patterns">
                {Object.entries(patterns).map(([key, shape]) => (
                  <label class="pattern-option" key={key} title={shape.label}>
                    <input
                      type="radio"
                      name="pattern"
                      aria-label={shape.label}
                      value={key}
                      checked={pattern === key}
                      onChange={() => {
                        setPattern(key);
                        void generate(theme, key);
                      }}
                    />
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <path d={shape.path} transform={shape.transform} />
                    </svg>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset class="logo-field">
              <legend>Organization</legend>
              <div class="input-row">
                <span>@</span>
                <input
                  aria-label="Organization GitHub ID"
                  placeholder="GitHub ID"
                  value={org}
                  onInput={(e) => {
                    setOrg(e.currentTarget.value);
                    setCustomLogo("");
                  }}
                  maxLength={39}
                  spellcheck={false}
                  autoCapitalize="none"
                />
              </div>
              <div class="logo-actions">
                <label class="upload-button">
                  Choose image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      void upload(e.currentTarget.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {(customLogo || org) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomLogo("");
                      setOrg("");
                    }}
                  >
                    Clear
                  </button>
                )}
                {customLogo && <img src={customLogo} alt="Organization logo" />}
              </div>
            </fieldset>
            <button class="primary" disabled={busy} type="submit">
              {busy ? "Generating…" : "Generate DevCard"}
            </button>
          </form>
          <p class={`status ${error ? "error" : ""}`} role="status" aria-live="polite">
            {message}
          </p>
          <div class="export">
            <button
              disabled={!devcard || busy}
              onClick={() => devcard && download(devcard.blob, `${devcard.name}-devcard.svg`)}
            >
              Save SVG
            </button>
            <button disabled={!devcard || busy || saving} onClick={png}>
              {saving ? "Saving…" : "Save PNG"}
            </button>
          </div>
          <div class="embed">
            <div class="embed-options">
              <label>
                Format
                <span class="embed-select">
                  <select
                    value={embedFormat}
                    onChange={(e) => {
                      setEmbedFormat(e.currentTarget.value);
                      setCopied(false);
                    }}
                  >
                    <option value="markdown">Markdown</option>
                    <option value="html">HTML</option>
                  </select>
                </span>
              </label>
              {embedFormat === "html" && (
                <div class="embed-width">
                  <label for="embed-width">Width (px)</label>
                  <div class="embed-number">
                    <input
                      id="embed-width"
                      type="number"
                      min="1"
                      max="2000"
                      value={width}
                      onInput={(e) => {
                        const next = e.currentTarget.valueAsNumber;
                        if (Number.isInteger(next) && next >= 1 && next <= 2000)
                          setEmbedWidth(next);
                        setCopied(false);
                      }}
                    />
                    <div class="embed-stepper">
                      <button
                        type="button"
                        aria-label="Increase width"
                        disabled={width >= 2000}
                        onClick={() => {
                          setEmbedWidth(Math.min(2000, width + 1));
                          setCopied(false);
                        }}
                      >
                        <span class="step-up" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Decrease width"
                        disabled={width <= 1}
                        onClick={() => {
                          setEmbedWidth(Math.max(1, width - 1));
                          setCopied(false);
                        }}
                      >
                        <span class="step-down" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <button
                class="embed-copy"
                disabled={!devcard || busy || devcard.uploaded}
                onClick={copy}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                </svg>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <code>
              {devcard?.uploaded
                ? "Uploaded logos are included in downloads only."
                : devcard
                  ? embedCode
                  : "—"}
            </code>
          </div>
        </section>
        <section class="preview" aria-label="Devcard preview" aria-busy={busy}>
          <div class="preview-label">
            <span>Preview</span>
            <span>
              {dimensions.width} × {dimensions.height}
            </span>
          </div>
          <div
            class={`card-stage ${previewLayout}`}
            onPointerMove={(e) => {
              if (
                e.pointerType !== "mouse" ||
                matchMedia("(prefers-reduced-motion: reduce)").matches
              )
                return;
              const rect = e.currentTarget.getBoundingClientRect();
              setTilt({
                x: (e.clientX - rect.left) / rect.width - 0.5,
                y: (e.clientY - rect.top) / rect.height - 0.5,
              });
            }}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          >
            {devcard ? (
              <img
                style={{
                  transform: `perspective(1000px) rotateX(${-tilt.y * 12}deg) rotateY(${tilt.x * 12}deg)`,
                }}
                src={devcard.image}
                alt={`${devcard.name}’s GitHub profile devcard`}
                width={dimensions.width}
                height={dimensions.height}
              />
            ) : (
              <div class="empty-card">
                <span>⌘</span>
                <p>{busy ? "Generating…" : "—"}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

render(<App />, document.getElementById("app")!);
