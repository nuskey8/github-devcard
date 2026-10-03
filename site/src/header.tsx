import { useAtomValue } from "jotai";
import { useLayoutEffect } from "preact/hooks";
import { themes } from "@github-devcard/worker/themes";
import { themeAtom } from "./state.ts";
import Logo from "../../assets/logo.svg?react";
import { siGithub, siKofi } from "simple-icons";

export function Header({ about = false }: { about?: boolean }) {
  const theme = useAtomValue(themeAtom);
  useLayoutEffect(() => {
    const selected = themes[theme];
    const root = document.documentElement;
    root.style.setProperty("--paper", selected.background);
    root.style.setProperty("--ink", selected.foreground);
    root.style.setProperty("--muted", selected.muted);
    root.style.setProperty("--page", selected.page);
  }, [theme]);

  return (
    <header>
      <a href={import.meta.env.BASE_URL} class="brand">
        <Logo class="brand-icon" viewBox="0 0 64 48" aria-hidden="true" />
        <span class="wordmark">
          GitHub<span> DevCard</span>
        </span>
      </a>
      <nav class="header-links" aria-label="Project links">
        <a
          class="about-link"
          href={`${import.meta.env.BASE_URL}about/`}
          aria-current={about ? "page" : undefined}
        >
          About
        </a>
        <a
          href="https://ko-fi.com/nuskey8"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support on Ko-fi"
          title="Ko-fi"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={siKofi.path} />
          </svg>
        </a>
        <a
          href="https://github.com/nuskey8/github-devcard"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          title="GitHub"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={siGithub.path} />
          </svg>
        </a>
      </nav>
    </header>
  );
}
