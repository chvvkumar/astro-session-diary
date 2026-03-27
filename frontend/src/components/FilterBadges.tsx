import { Component, For, Show } from "solid-js";
import { useSettingsContext } from "./SettingsProvider";

// Canonical filter category for a given filter name.
// Maps all common naming variations to one of the 7 standard categories,
// or returns null for non-standard filters (IR, Duoband, etc.)
function canonicalCategory(name: string): string | null {
  const n = name.toLowerCase().replace(/[_\-\s]/g, "");
  // Luminance
  if (n === "l" || n === "lum" || n === "luminance" || n === "luminosity" || n === "clear") return "L";
  // Red
  if (n === "r" || n === "red") return "R";
  // Green
  if (n === "g" || n === "green") return "G";
  // Blue
  if (n === "b" || n === "blue") return "B";
  // Sulfur II — check before Ha to avoid "sho" false matches
  if (n === "sii" || n === "s2" || n === "s" || n === "sulfur" || n === "sulphur"
    || n === "sulfurii" || n === "sulphurii") return "SII";
  // Hydrogen alpha
  if (n === "ha" || n === "h" || n === "halpha" || n === "hydrogenalpha"
    || n === "hydrogen" || n === "h alpha" || n === "656nm" || n === "656") return "Ha";
  // Oxygen III
  if (n === "oiii" || n === "o3" || n === "o" || n === "oxygen" || n === "oxygeniii"
    || n === "500nm" || n === "501nm") return "OIII";
  return null;
}

// Sort order: L R G B S H O, then everything else alphabetically
const FILTER_ORDER: Record<string, number> = {
  L: 0, R: 1, G: 2, B: 3, SII: 4, Ha: 5, OIII: 6,
};

const SHORT_LABEL: Record<string, string> = {
  Ha: "H",
  OIII: "O",
  SII: "S",
  L: "L",
  R: "R",
  G: "G",
  B: "B",
  OSC: "OSC",
  IR: "IR",
  Duoband: "Duo",
  "L-Ultimate": "L-Ult",
  "L-Extreme": "L-Ext",
  "L-Pro": "L-Pro",
  Ultimate: "Ult",
  Extreme: "Ext",
};

function filterSortKey(name: string): number {
  if (FILTER_ORDER[name] !== undefined) return FILTER_ORDER[name];
  const cat = canonicalCategory(name);
  if (cat && FILTER_ORDER[cat] !== undefined) return FILTER_ORDER[cat];
  return 100; // non-standard filters sort after LRGBSHO
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const FilterBadges: Component<{ distribution: Record<string, number>; compact?: boolean }> = (props) => {
  const { filterColorMap, filterAliasMap } = useSettingsContext();

  function getColor(name: string): string {
    const colorMap = filterColorMap();
    const aliasMap = filterAliasMap();
    const canonical = aliasMap[name] || name;
    if (colorMap[canonical]) return colorMap[canonical];
    const cat = canonicalCategory(name);
    if (cat && colorMap[cat]) return colorMap[cat];
    return "#666666";
  }

  const entries = () =>
    Object.entries(props.distribution).sort(([a], [b]) => {
      const orderA = filterSortKey(a);
      const orderB = filterSortKey(b);
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b); // alphabetical tiebreak for non-standard filters
    });

  return (
    <div class="flex gap-1.5 flex-wrap">
      <For each={entries()}>
        {([name, seconds]) => (
          <Show
            when={props.compact}
            fallback={
              <span class="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ "background-color": getColor(name), color: "black" }}>
                {name}&middot;{formatHours(seconds)}
              </span>
            }
          >
            <span
              class="h-6 rounded text-[10px] font-bold flex items-center justify-center"
              style={{ "background-color": getColor(name), color: "black" }}
              classList={{ "w-6": (SHORT_LABEL[name] || name).length <= 1, "px-1.5": (SHORT_LABEL[name] || name).length > 1 }}
              title={name}
            >
              {SHORT_LABEL[name] || name}
            </span>
          </Show>
        )}
      </For>
    </div>
  );
};

export default FilterBadges;
