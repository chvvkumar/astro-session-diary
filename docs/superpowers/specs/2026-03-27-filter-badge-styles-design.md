# Filter Badge Styles — Design Spec

## Overview

Add 6 new visual styles for filter badges (L, R, G, B, Ha, SII, OIII, IR, Duoband, etc.) and a global setting to choose between them. All filter badges throughout the UI update to reflect the selected style.

## Filter Badge Style

### Style Enum

Seven options stored as a string:

| Key | Name | Description |
|-----|------|-------------|
| `solid` | Solid (Current) | Full-opacity colored background, contrast-aware text (black or white) |
| `muted` | Muted Backgrounds | ~15% opacity colored background, fully saturated colored text |
| `outlined` | Outlined (Hollow) | Transparent background, 1.5px solid colored border, colored text |
| `text-only` | Colored Text Only | Uniform dark gray (`#2a2a3a`) background, colored text |
| `indicator-dots` | Indicator Dots | Dark gray background, light gray text, 6px colored circle dot before label |
| `underline` | Underline Accents | Dark gray background, light gray text, 2px colored bottom border |
| `tint-border` | Subtle Tint & Border | ~10% opacity colored background, ~30% opacity colored border, colored text |

Default: `solid` (preserves current behavior).

### Style Rendering Logic

A single utility module `filterStyles.ts` exports:

```typescript
type FilterBadgeStyle = "solid" | "muted" | "outlined" | "text-only" | "indicator-dots" | "underline" | "tint-border";

interface FilterBadgeStyleResult {
  style: Record<string, string>;   // inline CSS properties
  dot?: string;                     // hex color for the dot (indicator-dots only)
}

function getFilterBadgeStyle(styleName: FilterBadgeStyle, hexColor: string): FilterBadgeStyleResult;
```

Each style computes its CSS properties from the single hex color input:

- **solid**: `{ background-color: color, color: contrastText(color) }` — uses luminance check for black/white text
- **muted**: `{ background-color: hexToRgba(color, 0.15), color: color }`
- **outlined**: `{ background-color: "transparent", border: "1.5px solid ${color}", color: color }`
- **text-only**: `{ background-color: "#2a2a3a", color: color }`
- **indicator-dots**: `{ background-color: "#2a2a3a", color: "#d1d5db" }` + `dot: color`
- **underline**: `{ background-color: "#2a2a3a", color: "#d1d5db", border-bottom: "2px solid ${color}" }`
- **tint-border**: `{ background-color: hexToRgba(color, 0.10), border: "1px solid ${hexToRgba(color, 0.30)}", color: color }`

Helper functions in the same module:
- `hexToRgba(hex, alpha)` — converts hex to `rgba(r, g, b, a)` string
- `contrastText(hex)` — returns `"black"` or `"white"` based on relative luminance threshold

## Setting Storage

### Backend

Add `filter_style` field to `GeneralSettings` (Pydantic model in `backend/app/schemas/settings.py`):

```python
class GeneralSettings(BaseModel):
    # ... existing fields ...
    filter_style: str = "solid"
```

No validation enum needed — the frontend owns the style definitions. The backend just stores the string.

### Frontend Types

Add to `GeneralSettings` in `frontend/src/types/index.ts`:

```typescript
export interface GeneralSettings {
  // ... existing fields ...
  filter_style: string;  // "solid" | "muted" | "outlined" | etc.
}
```

### Settings Provider

Expose `filterBadgeStyle()` as a computed accessor in `SettingsProvider` so any component can read the current style without prop drilling:

```typescript
filterBadgeStyle(): FilterBadgeStyle  // derived from settings().general.filter_style
```

## Settings UI

### Location

General tab in Settings page — this is a display preference, not filter-specific configuration.

### Control Layout

A row containing:
1. **Label**: "Filter badge style"
2. **Dropdown `<select>`**: Lists all 7 style names
3. **Preview strip**: Immediately to the right of the dropdown — renders 4 sample badges (L, R, Ha, O) using the currently selected style with their default colors

The preview updates live as the user changes the dropdown selection. The setting saves immediately on change (same pattern as other general settings — call `saveGeneral()`).

## Components to Update

All components that render filter badges or buttons must consume the style from settings context and apply via `getFilterBadgeStyle()`:

| Component | Current Approach | Change |
|-----------|-----------------|--------|
| `FilterBadges.tsx` | Inline `style={{ "background-color": color, color: "black" }}` | Use `getFilterBadgeStyle(style, color)` |
| `FilterToggles.tsx` | Inline `style={{ "background-color": color, color: "black" }}` | Use `getFilterBadgeStyle(style, color)` |
| `FilterUsageChart.tsx` | Inline style on bar + label | Use `getFilterBadgeStyle(style, color)` for label badges |
| `GroupingEditor.tsx` | Inline style on filter chips | Use `getFilterBadgeStyle(style, color)` |

### Indicator Dots Special Case

For `indicator-dots` style, components render an additional `<span>` (6px colored circle) before the filter label text. The `getFilterBadgeStyle` return value includes a `dot` field — when present, the component renders the dot element.

## Files to Create/Modify

### New
- `frontend/src/utils/filterStyles.ts` — style definitions, `getFilterBadgeStyle()`, helpers

### Modified
- `backend/app/schemas/settings.py` — add `filter_style` to `GeneralSettings`
- `frontend/src/types/index.ts` — add `filter_style` to `GeneralSettings`
- `frontend/src/utils/filterStyles.ts` — new file
- `frontend/src/components/SettingsProvider.tsx` — expose `filterBadgeStyle()` accessor
- `frontend/src/components/FilterBadges.tsx` — consume style, apply via utility
- `frontend/src/components/FilterToggles.tsx` — consume style, apply via utility
- `frontend/src/components/FilterUsageChart.tsx` — consume style, apply via utility
- `frontend/src/components/settings/GroupingEditor.tsx` — consume style, apply via utility
- `frontend/src/components/settings/GeneralTab.tsx` — add dropdown + preview control

## Out of Scope

- Per-filter style overrides (all filters use the same style)
- Animation/transitions between styles
- Custom user-defined styles beyond the 7 presets
