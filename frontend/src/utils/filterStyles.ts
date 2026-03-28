// frontend/src/utils/filterStyles.ts

export type FilterBadgeStyle =
  | "solid"
  | "muted"
  | "muted-bright"
  | "outlined"
  | "text-only"
  | "indicator-dots"
  | "underline"
  | "tint-border"
  | "tint-border-bright";

export const FILTER_STYLE_OPTIONS: { value: FilterBadgeStyle; label: string }[] = [
  { value: "solid", label: "Solid (Default)" },
  { value: "muted", label: "Muted Backgrounds" },
  { value: "muted-bright", label: "Muted Backgrounds (Bright)" },
  { value: "outlined", label: "Outlined (Hollow)" },
  { value: "text-only", label: "Colored Text Only" },
  { value: "indicator-dots", label: "Indicator Dots" },
  { value: "underline", label: "Underline Accents" },
  { value: "tint-border", label: "Subtle Tint & Border" },
  { value: "tint-border-bright", label: "Subtle Tint & Border (Bright)" },
];

export interface FilterBadgeStyleResult {
  /** Inline CSS properties to spread onto the element */
  style: Record<string, string>;
  /** When present, render a 6px colored dot before the label */
  dot?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Returns "black" or "white" based on relative luminance of the background */
function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  // Relative luminance formula (sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "black" : "white";
}

export function getFilterBadgeStyle(
  styleName: FilterBadgeStyle,
  hexColor: string,
): FilterBadgeStyleResult {
  switch (styleName) {
    case "solid":
      return {
        style: {
          "background-color": hexColor,
          color: contrastText(hexColor),
        },
      };
    case "muted":
      return {
        style: {
          "background-color": hexToRgba(hexColor, 0.15),
          color: hexColor,
        },
      };
    case "muted-bright":
      return {
        style: {
          "background-color": hexToRgba(hexColor, 0.57),
          color: contrastText(hexColor),
        },
      };
    case "outlined":
      return {
        style: {
          "background-color": "transparent",
          border: `1.5px solid ${hexColor}`,
          color: hexColor,
        },
      };
    case "text-only":
      return {
        style: {
          "background-color": "#2a2a3a",
          color: hexColor,
        },
      };
    case "indicator-dots":
      return {
        style: {
          "background-color": "#2a2a3a",
          color: "#d1d5db",
        },
        dot: hexColor,
      };
    case "underline":
      return {
        style: {
          "background-color": "#2a2a3a",
          color: "#d1d5db",
          "border-bottom": `2px solid ${hexColor}`,
        },
      };
    case "tint-border":
      return {
        style: {
          "background-color": hexToRgba(hexColor, 0.1),
          border: `1px solid ${hexToRgba(hexColor, 0.3)}`,
          color: hexColor,
        },
      };
    case "tint-border-bright":
      return {
        style: {
          "background-color": hexToRgba(hexColor, 0.55),
          border: `1px solid ${hexToRgba(hexColor, 0.65)}`,
          color: contrastText(hexColor),
        },
      };
  }
}
