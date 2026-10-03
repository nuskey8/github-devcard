const rawPatterns: Record<string, { label: string; path: string }> = {
  leaf: {
    label: "Leaf",
    path: "M4 100Q0 100 0 96V60A60 60 0 0 1 60 0H96Q100 0 100 4V40A60 60 0 0 1 40 100Z",
  },
  circle: { label: "Circle", path: "M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z" },
  arch: { label: "Arch", path: "M6 100Q0 100 0 94V50A50 50 0 0 1 100 50V94Q100 100 94 100Z" },
  rounded: {
    label: "Squircle",
    path: "M50 0C90 0 100 10 100 50S90 100 50 100S0 90 0 50S10 0 50 0Z",
  },
  diamond: {
    label: "Diamond",
    path: "M44 3Q50-3 56 3L97 44Q103 50 97 56L56 97Q50 103 44 97L3 56Q-3 50 3 44Z",
  },
  capsule: {
    label: "Capsule",
    path: "M40 0H60A40 40 0 0 1 100 40V60A40 40 0 0 1 60 100H40A40 40 0 0 1 0 60V40A40 40 0 0 1 40 0Z",
  },
  clover: {
    label: "Clover",
    path: "M50 14C34-12 0 0 0 26Q0 42 14 50Q0 58 0 74C0 100 34 112 50 86C66 112 100 100 100 74Q100 58 86 50Q100 42 100 26C100 0 66-12 50 14Z",
  },
  cross: {
    label: "Cross",
    path: "M36 0H64Q70 0 70 6V22Q70 30 78 30H94Q100 30 100 36V64Q100 70 94 70H78Q70 70 70 78V94Q70 100 64 100H36Q30 100 30 94V78Q30 70 22 70H6Q0 70 0 64V36Q0 30 6 30H22Q30 30 30 22V6Q30 0 36 0Z",
  },
  hexagon: {
    label: "Hexagon",
    path: "M31 0L69 0Q75 0 78 5.19615242271L97 38.1051177665Q100 43.3012701892 97 48.4974226119L78 81.4063879557Q75 86.6025403784 69 86.6025403784L31 86.6025403784Q25 86.6025403784 22 81.4063879557L3 48.4974226119Q0 43.3012701892 3 38.1051177665L22 5.19615242271Q25 0 31 0Z",
  },
  octagon: {
    label: "Octagon",
    path: "M32 0H68Q72 0 75 3L97 25Q100 28 100 32V68Q100 72 97 75L75 97Q72 100 68 100H32Q28 100 25 97L3 75Q0 72 0 68V32Q0 28 3 25L25 3Q28 0 32 0Z",
  },
  petal: {
    label: "Petal",
    path: "M5 0H50A50 50 0 0 1 100 50V95Q100 100 95 100H50A50 50 0 0 1 0 50V5Q0 0 5 0Z",
  },
  wave: {
    label: "Wave",
    path: "M0 16C25-4 25-4 50 16S75 36 100 16V84C75 104 75 104 50 84S25 64 0 84Z",
  },
  shield: {
    label: "Shield",
    path: "M8 0H92Q100 0 100 8V42C100 70 82 88 54 99Q50 101 46 99C18 88 0 70 0 42V8Q0 0 8 0Z",
  },
  ticket: {
    label: "Ticket",
    path: "M8 0H92Q100 0 100 8V38A12 12 0 0 0 100 62V92Q100 100 92 100H8Q0 100 0 92V62A12 12 0 0 0 0 38V8Q0 0 8 0Z",
  },
  burst: {
    label: "Scallop",
    path: "M44.56 4.72Q50.00 0.00 55.44 4.72Q60.87 9.43 67.94 8.06Q75.00 6.70 77.35 13.50Q79.70 20.30 86.50 22.65Q93.30 25.00 91.94 32.06Q90.57 39.13 95.28 44.56Q100.00 50.00 95.28 55.44Q90.57 60.87 91.94 67.94Q93.30 75.00 86.50 77.35Q79.70 79.70 77.35 86.50Q75.00 93.30 67.94 91.94Q60.87 90.57 55.44 95.28Q50.00 100.00 44.56 95.28Q39.13 90.57 32.06 91.94Q25.00 93.30 22.65 86.50Q20.30 79.70 13.50 77.35Q6.70 75.00 8.06 67.94Q9.43 60.87 4.72 55.44Q0.00 50.00 4.72 44.56Q9.43 39.13 8.06 32.06Q6.70 25.00 13.50 22.65Q20.30 20.30 22.65 13.50Q25.00 6.70 32.06 8.06Q39.13 9.43 44.56 4.72Z",
  },
  heart: {
    label: "Heart",
    path: "M50 98C38 86 0 60 0 30C0 0 34-9 50 18C66-9 100 0 100 30C100 60 62 86 50 98Z",
  },
};

// Tight geometric bounds, including Bezier extrema and circular arcs.
// Fit the silhouette into a square without distorting its aspect ratio.
const silhouetteBounds: Record<string, readonly [number, number, number, number]> = {
  leaf: [0, 0, 100, 100],
  circle: [0, 0, 100, 100],
  arch: [0, 0, 100, 100],
  rounded: [0, 0, 100, 100],
  diamond: [0, 0, 100, 100],
  capsule: [0, 0, 100, 100],
  clover: [0, -0.504258832546, 100, 101.008517665],
  cross: [0, 0, 100, 100],
  hexagon: [1.5, 0, 97, 86.6025403784],
  octagon: [0, 0, 100, 100],
  petal: [0, 0, 100, 100],
  wave: [0, 1, 100, 98],
  shield: [0, 0, 100, 100],
  ticket: [-2.20436423847e-15, 0, 100, 100],
  burst: [2.36, 2.36, 95.28, 95.28],
  heart: [0, 1.91098494347, 100, 96.0890150565],
};

export const patterns = Object.fromEntries(
  Object.entries(rawPatterns).map(([key, shape]) => {
    const [x, y, width, height] = silhouetteBounds[key];
    const scale = 100 / Math.max(width, height);
    const offsetX = (100 - width * scale) / 2;
    const offsetY = (100 - height * scale) / 2;
    return [
      key,
      {
        ...shape,
        transform: `translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-x} ${-y})`,
      },
    ];
  }),
);

export function renderShape(key: string): string {
  const shape = patterns[key] || patterns.leaf;
  return `<path d="${shape.path}" transform="${shape.transform}"/>`;
}

export function renderAvatarMask(key: string, size = 516, y = 42): string {
  const shape = patterns[key] || patterns.leaf;
  return `<path d="${shape.path}" transform="translate(42 ${y}) scale(${size / 100}) ${shape.transform}"/>`;
}
