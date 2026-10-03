export interface Theme {
  label: string;
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  line: string;
  page: string;
}

const palette = (label: string, background: string, foreground: string, page: string): Theme => ({
  label,
  background,
  foreground,
  muted: foreground,
  accent: foreground,
  line: foreground,
  page,
});

// Similar palettes are grouped together in the picker.
export const themes: Record<string, Theme> = {
  // Coral and pink paper.
  paper: palette("Letterpress", "#fdfbee", "#b83220", "#fe4f2d"),
  orange: palette("Coral Club", "#ffce96", "#00303b", "#ff7777"),
  peach: palette("Ice Cream", "#fff6d3", "#7c3f58", "#eb6b6f"),
  // Gold and brown.
  brass: palette("Warm Brass", "#fff3db", "#5d4218", "#c5a667"),
  espresso: palette("Espresso", "#2d211c", "#f7d9b0", "#84654d"),
  // Yellow and botanical green.
  lemon: palette("Acid Press", "#f6ff99", "#000b58", "#48b3af"),
  forest: palette("Forest Study", "#edf5e6", "#214b38", "#87a878"),
  // Teal and deep green.
  sky: palette("Blue Note", "#fdfbee", "#015551", "#57b4ba"),
  pine: palette("Midnight Pine", "#10251f", "#bce4bc", "#2d5546"),
  // Navy and blue.
  cobalt: palette("Poolside", "#16325b", "#ffdc7f", "#78b7d0"),
  ocean: palette("Deep Ocean", "#061f35", "#e2f3fc", "#365e79"),
  // Indigo and violet.
  indigo: palette("Indigo Night", "#1b1933", "#c9bef7", "#464064"),
  lavender: palette("Orchid Ink", "#452459", "#ffffff", "#d03791"),
  plum: palette("Plum Paper", "#f4eaf7", "#572a68", "#a984b8"),
  // Rose and burgundy.
  rose: palette("Ink Pink", "#260d34", "#fe6c90", "#87286a"),
  burgundy: palette("Burgundy Velvet", "#2b1520", "#f3bbc9", "#663446"),
  // GitHub-inspired neutrals and green accents.
  "github-light": {
    ...palette("GitHub Light", "#ffffff", "#1f2328", "#f6f8fa"),
    muted: "#59636e",
    accent: "#1a7f37",
    line: "#d1d9e0",
  },
  "github-dark": {
    ...palette("GitHub Dark", "#0d1117", "#f0f6fc", "#161b22"),
    muted: "#9198a1",
    accent: "#3fb950",
    line: "#3d444d",
  },
};
