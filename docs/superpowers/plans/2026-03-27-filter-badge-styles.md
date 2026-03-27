# Filter Badge Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 visual styles for filter badges with a global setting to choose between them.

**Architecture:** A single utility module computes inline CSS from a style name + hex color. The setting is stored in `GeneralSettings` (backend + frontend). All filter-rendering components read the style from context and delegate styling to the utility.

**Tech Stack:** SolidJS, Tailwind CSS, FastAPI/Pydantic, TypeScript

---

### Task 1: Create filter styles utility module

**Files:**
- Create: `frontend/src/utils/filterStyles.ts`

- [ ] **Step 1: Create the utility module with all style definitions**

```typescript
// frontend/src/utils/filterStyles.ts

export type FilterBadgeStyle =
  | "solid"
  | "muted"
  | "outlined"
  | "text-only"
  | "indicator-dots"
  | "underline"
  | "tint-border";

export const FILTER_STYLE_OPTIONS: { value: FilterBadgeStyle; label: string }[] = [
  { value: "solid", label: "Solid (Default)" },
  { value: "muted", label: "Muted Backgrounds" },
  { value: "outlined", label: "Outlined (Hollow)" },
  { value: "text-only", label: "Colored Text Only" },
  { value: "indicator-dots", label: "Indicator Dots" },
  { value: "underline", label: "Underline Accents" },
  { value: "tint-border", label: "Subtle Tint & Border" },
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
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/filterStyles.ts
git commit -m "feat: add filter badge style utility with 7 style definitions"
```

---

### Task 2: Add filter_style to backend and frontend types

**Files:**
- Modify: `backend/app/schemas/settings.py:4-9` — add `filter_style` field
- Modify: `frontend/src/types/index.ts:261-267` — add `filter_style` field

- [ ] **Step 1: Add filter_style to backend GeneralSettings**

In `backend/app/schemas/settings.py`, add the field to the `GeneralSettings` class:

```python
class GeneralSettings(BaseModel):
    auto_scan_enabled: bool = True
    auto_scan_interval: int = 240
    thumbnail_width: int = 800
    default_page_size: int = 50
    include_calibration: bool = True
    filter_style: str = "solid"
```

- [ ] **Step 2: Add filter_style to frontend GeneralSettings type**

In `frontend/src/types/index.ts`, update the `GeneralSettings` interface:

```typescript
export interface GeneralSettings {
  auto_scan_enabled: boolean;
  auto_scan_interval: number;
  thumbnail_width: number;
  default_page_size: number;
  include_calibration: boolean;
  filter_style: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/settings.py frontend/src/types/index.ts
git commit -m "feat: add filter_style field to GeneralSettings (backend + frontend)"
```

---

### Task 3: Expose filterBadgeStyle in SettingsProvider

**Files:**
- Modify: `frontend/src/components/SettingsProvider.tsx`

- [ ] **Step 1: Add filterBadgeStyle to context interface and provider**

Update `SettingsProvider.tsx` to import the type and expose the computed accessor:

```typescript
import { createContext, useContext, type ParentComponent } from "solid-js";
import { useSettings, getFilterColorMap, getFilterAliasMap } from "../store/settings";
import type { SettingsResponse, GeneralSettings, FilterConfig, EquipmentConfig } from "../types";
import type { Resource } from "solid-js";
import type { FilterBadgeStyle } from "../utils/filterStyles";

interface SettingsContextValue {
  settings: Resource<SettingsResponse | undefined>;
  filterColorMap: () => Record<string, string>;
  filterAliasMap: () => Record<string, string>;
  filterBadgeStyle: () => FilterBadgeStyle;
  saveGeneral: (g: GeneralSettings) => Promise<SettingsResponse>;
  saveFilters: (f: Record<string, FilterConfig>) => Promise<SettingsResponse>;
  saveEquipment: (e: EquipmentConfig) => Promise<SettingsResponse>;
  refetchSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue>();

export const SettingsProvider: ParentComponent = (props) => {
  const store = useSettings();

  const value: SettingsContextValue = {
    settings: store.settings,
    filterColorMap: () => getFilterColorMap(store.settings()),
    filterAliasMap: () => getFilterAliasMap(store.settings()),
    filterBadgeStyle: () => (store.settings()?.general.filter_style as FilterBadgeStyle) || "solid",
    saveGeneral: store.saveGeneral,
    saveFilters: store.saveFilters,
    saveEquipment: store.saveEquipment,
    refetchSettings: store.refetchSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {props.children}
    </SettingsContext.Provider>
  );
};

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used within SettingsProvider");
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SettingsProvider.tsx
git commit -m "feat: expose filterBadgeStyle accessor in SettingsProvider context"
```

---

### Task 4: Update FilterBadges to use style utility

**Files:**
- Modify: `frontend/src/components/FilterBadges.tsx`

- [ ] **Step 1: Update FilterBadges to consume style from context**

Replace the inline style bindings with the utility function. Import `getFilterBadgeStyle` and `useSettingsContext`'s `filterBadgeStyle`. Add dot rendering for `indicator-dots` style:

```typescript
import { Component, For, Show } from "solid-js";
import { useSettingsContext } from "./SettingsProvider";
import { getFilterBadgeStyle } from "../utils/filterStyles";

// canonicalCategory, FILTER_ORDER, SHORT_LABEL, filterSortKey, formatHours — unchanged

const FilterBadges: Component<{ distribution: Record<string, number>; compact?: boolean }> = (props) => {
  const { filterColorMap, filterAliasMap, filterBadgeStyle } = useSettingsContext();

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
      return a.localeCompare(b);
    });

  return (
    <div class="flex gap-1.5 flex-wrap">
      <For each={entries()}>
        {([name, seconds]) => {
          const badgeStyle = () => getFilterBadgeStyle(filterBadgeStyle(), getColor(name));
          return (
            <Show
              when={props.compact}
              fallback={
                <span class="px-2 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1" style={badgeStyle().style}>
                  <Show when={badgeStyle().dot}>
                    <span class="w-1.5 h-1.5 rounded-full inline-block" style={{ "background-color": badgeStyle().dot }} />
                  </Show>
                  {name}&middot;{formatHours(seconds)}
                </span>
              }
            >
              <span
                class="h-6 rounded text-[10px] font-bold flex items-center justify-center gap-0.5"
                style={badgeStyle().style}
                classList={{ "w-6": (SHORT_LABEL[name] || name).length <= 1 && !badgeStyle().dot, "px-1.5": (SHORT_LABEL[name] || name).length > 1 || !!badgeStyle().dot }}
                title={name}
              >
                <Show when={badgeStyle().dot}>
                  <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ "background-color": badgeStyle().dot }} />
                </Show>
                {SHORT_LABEL[name] || name}
              </span>
            </Show>
          );
        }}
      </For>
    </div>
  );
};

export default FilterBadges;
```

- [ ] **Step 2: Verify the app renders without errors**

Run: `cd frontend && npm run dev`

Open the dashboard and confirm filter badges render with the default "solid" style (should look identical to before).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FilterBadges.tsx
git commit -m "feat: update FilterBadges to use style utility for badge rendering"
```

---

### Task 5: Update FilterToggles to use style utility

**Files:**
- Modify: `frontend/src/components/FilterToggles.tsx`

- [ ] **Step 1: Update FilterToggles to consume style from context**

```typescript
import { Component, For, Show, createResource } from "solid-js";
import { useCatalog } from "../store/catalog";
import { useSettingsContext } from "./SettingsProvider";
import { api } from "../api/client";
import { getFilterBadgeStyle } from "../utils/filterStyles";

const FilterToggles: Component = () => {
  const { filters, toggleOpticalFilter } = useCatalog();
  const { settings, filterColorMap, filterAliasMap, filterBadgeStyle } = useSettingsContext();
  const [discovered] = createResource(() => api.getDiscovered("filters").then((r) => r.items));

  const isActive = (f: string) => filters().opticalFilters.includes(f);

  function getColor(name: string): string {
    const colorMap = filterColorMap();
    const aliasMap = filterAliasMap();
    const canonical = aliasMap[name] || name;
    return colorMap[canonical] || colorMap[name] || "#666666";
  }

  const groupedFilters = () => {
    const s = settings();
    if (!s) return [];
    return Object.keys(s.filters);
  };

  const ungroupedFilters = () => {
    const s = settings();
    const disc = discovered();
    if (!disc) return [];
    if (!s) return disc.map((d) => d.name);

    const covered = new Set<string>();
    for (const [canonical, cfg] of Object.entries(s.filters)) {
      covered.add(canonical);
      for (const alias of cfg.aliases) covered.add(alias);
    }
    return disc.map((d) => d.name).filter((name) => !covered.has(name));
  };

  const renderPill = (name: string) => {
    const active = isActive(name);
    const color = getColor(name);
    const badgeStyle = () => getFilterBadgeStyle(filterBadgeStyle(), color);
    return (
      <button
        onClick={() => toggleOpticalFilter(name)}
        class={`h-6 rounded text-[10px] font-bold flex items-center justify-center gap-0.5 transition-all ${
          active ? "ring-2 ring-white/50 brightness-110" : "hover:brightness-110"
        }`}
        classList={{ "w-6": name.length <= 1 && !badgeStyle().dot, "px-1.5": name.length > 1 || !!badgeStyle().dot }}
        style={badgeStyle().style}
        title={name}
      >
        <Show when={badgeStyle().dot}>
          <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ "background-color": badgeStyle().dot }} />
        </Show>
        {name}
      </button>
    );
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Filters</label>
      <div class="space-y-1.5">
        <Show when={groupedFilters().length > 0}>
          <span class="text-[10px] text-astro-muted">Grouped</span>
          <div class="flex gap-1.5 flex-wrap">
            <For each={groupedFilters()}>{(f) => renderPill(f)}</For>
          </div>
        </Show>
        <Show when={ungroupedFilters().length > 0}>
          <span class="text-[10px] text-astro-muted">Ungrouped</span>
          <div class="flex gap-1.5 flex-wrap">
            <For each={ungroupedFilters()}>{(f) => renderPill(f)}</For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default FilterToggles;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FilterToggles.tsx
git commit -m "feat: update FilterToggles to use style utility for badge rendering"
```

---

### Task 6: Update FilterUsageChart to use style utility

**Files:**
- Modify: `frontend/src/components/FilterUsageChart.tsx`

- [ ] **Step 1: Update FilterUsageChart**

The chart uses colored bars — the bar itself should keep using the raw color for the progress bar, but the filter name label on the left can optionally be styled. Since the name is plain text in the current layout (not a badge), we only apply the style to a small badge-like label:

```typescript
import { Component, For, Show } from "solid-js";
import { useSettingsContext } from "./SettingsProvider";
import { getFilterBadgeStyle } from "../utils/filterStyles";

const FilterUsageChart: Component<{ usage: Record<string, number> }> = (props) => {
  const { filterColorMap, filterAliasMap, filterBadgeStyle } = useSettingsContext();

  function getColor(name: string): string {
    const colorMap = filterColorMap();
    const aliasMap = filterAliasMap();
    const canonical = aliasMap[name] || name;
    return colorMap[canonical] || colorMap[name] || "#6b7280";
  }

  const entries = () => Object.entries(props.usage).sort(([, a], [, b]) => b - a);
  const maxVal = () => Math.max(...Object.values(props.usage), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Filter Usage</h3>
      <For each={entries()}>
        {([name, seconds]) => {
          const color = getColor(name);
          const badgeStyle = () => getFilterBadgeStyle(filterBadgeStyle(), color);
          return (
            <div class="flex items-center gap-2 text-xs">
              <span
                class="w-12 text-center text-[10px] font-bold rounded px-1 py-0.5 inline-flex items-center justify-center gap-0.5"
                style={badgeStyle().style}
              >
                <Show when={badgeStyle().dot}>
                  <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ "background-color": badgeStyle().dot }} />
                </Show>
                {name}
              </span>
              <div class="flex-1 bg-astro-dark rounded-full h-4 overflow-hidden">
                <div
                  class="h-4 rounded-full transition-all"
                  style={{ width: `${(seconds / maxVal()) * 100}%`, "background-color": color }}
                />
              </div>
              <span class="w-14 text-right text-white">{(seconds / 3600).toFixed(1)}h</span>
            </div>
          );
        }}
      </For>
    </div>
  );
};

export default FilterUsageChart;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FilterUsageChart.tsx
git commit -m "feat: update FilterUsageChart to use style utility for filter labels"
```

---

### Task 7: Add filter badge style selector to GeneralTab

**Files:**
- Modify: `frontend/src/components/settings/GeneralTab.tsx`

- [ ] **Step 1: Add the style dropdown with live preview**

Update `GeneralTab.tsx` to include the filter badge style selector with a preview strip:

```typescript
// frontend/src/components/settings/GeneralTab.tsx
import { createSignal, createEffect, Show, For, type Component } from "solid-js";
import { useSettingsContext } from "../SettingsProvider";
import { showToast } from "../Toast";
import type { GeneralSettings } from "../../types";
import { FILTER_STYLE_OPTIONS, getFilterBadgeStyle, type FilterBadgeStyle } from "../../utils/filterStyles";

const INTERVALS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
];

const PAGE_SIZES = [25, 50, 100];

const PREVIEW_FILTERS: { name: string; color: string }[] = [
  { name: "L", color: "#e0e0e0" },
  { name: "R", color: "#e05050" },
  { name: "G", color: "#50b050" },
  { name: "B", color: "#5070e0" },
  { name: "Sii", color: "#d4a43a" },
  { name: "H", color: "#c44040" },
  { name: "O", color: "#3a8fd4" },
];

export const GeneralTab: Component = () => {
  const { settings, saveGeneral } = useSettingsContext();
  const [local, setLocal] = createSignal<GeneralSettings>({
    auto_scan_enabled: true,
    auto_scan_interval: 240,
    thumbnail_width: 800,
    default_page_size: 50,
    include_calibration: true,
    filter_style: "solid",
  });
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    const s = settings();
    if (s) setLocal({ ...s.general });
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGeneral(local());
      showToast("General settings saved");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-6 max-w-lg">
      {/* Auto-scan toggle */}
      <div class="flex justify-between items-center">
        <label class="text-sm text-white">Auto-scan enabled</label>
        <button
          onClick={() => setLocal((p) => ({ ...p, auto_scan_enabled: !p.auto_scan_enabled }))}
          class={`relative w-10 h-5 rounded-full transition-colors ${
            local().auto_scan_enabled ? "bg-astro-accent" : "bg-gray-600"
          }`}
        >
          <span
            class={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              local().auto_scan_enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {/* Auto-scan interval */}
      <div class="space-y-1">
        <label class="text-sm text-white">Scan interval</label>
        <select
          value={local().auto_scan_interval}
          onChange={(e) =>
            setLocal((p) => ({ ...p, auto_scan_interval: parseInt(e.currentTarget.value) }))
          }
          class="w-full px-3 py-2 bg-astro-dark border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-astro-accent"
        >
          {INTERVALS.map((opt) => (
            <option value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Thumbnail width */}
      <div class="space-y-1">
        <label class="text-sm text-white">Thumbnail max width (px)</label>
        <input
          type="number"
          min={200}
          max={2000}
          step={100}
          value={local().thumbnail_width}
          onInput={(e) =>
            setLocal((p) => ({ ...p, thumbnail_width: parseInt(e.currentTarget.value) || 800 }))
          }
          class="w-full px-3 py-2 bg-astro-dark border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-astro-accent"
        />
      </div>

      {/* Default page size */}
      <div class="space-y-1">
        <label class="text-sm text-white">Default page size</label>
        <select
          value={local().default_page_size}
          onChange={(e) =>
            setLocal((p) => ({ ...p, default_page_size: parseInt(e.currentTarget.value) }))
          }
          class="w-full px-3 py-2 bg-astro-dark border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-astro-accent"
        >
          {PAGE_SIZES.map((s) => (
            <option value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Filter badge style */}
      <div class="space-y-1">
        <label class="text-sm text-white">Filter badge style</label>
        <div class="flex items-center gap-4">
          <select
            value={local().filter_style || "solid"}
            onChange={(e) =>
              setLocal((p) => ({ ...p, filter_style: e.currentTarget.value }))
            }
            class="px-3 py-2 bg-astro-dark border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-astro-accent"
          >
            <For each={FILTER_STYLE_OPTIONS}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
          <div class="flex gap-1.5 items-center">
            <For each={PREVIEW_FILTERS}>
              {(f) => {
                const badgeStyle = () => getFilterBadgeStyle((local().filter_style || "solid") as FilterBadgeStyle, f.color);
                return (
                  <span
                    class="h-6 rounded text-[10px] font-bold flex items-center justify-center gap-0.5 px-1.5"
                    style={badgeStyle().style}
                  >
                    <Show when={badgeStyle().dot}>
                      <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ "background-color": badgeStyle().dot }} />
                    </Show>
                    {f.name}
                  </span>
                );
              }}
            </For>
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving()}
        class="px-4 py-2 bg-astro-accent text-white rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving() ? "Saving..." : "Save"}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Verify the settings page renders the dropdown and preview**

Run: `cd frontend && npm run dev`

Navigate to Settings > General. Confirm the dropdown appears with all 7 options and the preview strip updates live when changing the selection.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/settings/GeneralTab.tsx
git commit -m "feat: add filter badge style dropdown with live preview to General settings"
```

---

### Task 8: Verify end-to-end and final commit

- [ ] **Step 1: Test all styles end-to-end**

Run: `cd frontend && npm run dev`

1. Go to Settings > General
2. Select each of the 7 styles from the dropdown — verify the preview strip updates
3. Click Save
4. Navigate to the dashboard — confirm target cards show badges in the selected style
5. Check the sidebar filter toggles — confirm they match the selected style
6. Open a target detail page — confirm the filter usage chart labels match

- [ ] **Step 2: Run the build to check for type errors**

Run: `cd frontend && npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: resolve any build issues from filter badge styles"
```
