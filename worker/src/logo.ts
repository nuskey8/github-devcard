import logo from "../../assets/logo.svg?raw" with { type: "text" };

export function renderCardMark(ink: string, paper: string): string {
  return logo.trim().replaceAll("currentColor", ink).replaceAll("var(--paper, #ffffff)", paper);
}
