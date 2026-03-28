# Session Detail Redesign: Metrics Charts & Summary Table

## Overview

Redesign the expanded session detail view and add metrics charting at both session and target levels. Remove best/worst frame sections, restructure the session summary as a proper table with Avg/Min/Max columns, clarify median labels in the filters table, and introduce interactive Chart.js line graphs for visualizing metrics over time.

## Changes

### 1. Session Summary Table

Replace the current left-side vertical metric list with a structured table.

**Metrics with Avg/Min/Max columns:**
- HFR
- Eccentricity
- FWHM
- Sensor Temp
- Guiding RMS

**Single-value metrics** shown as compact inline items below the table:
- Integration (total hours)
- Frames (count)
- Gain / Exp
- Time Span

The "Avg" column displays the session median (matching the existing computation). Min and Max use the existing `min_*` / `max_*` fields already returned by the API.

### 2. Filters Table

- Remove the "Best Frame" and "Worst Frame" column groups entirely (6 columns removed).
- Rename the HFR column header from "HFR" to "Med. HFR".
- Rename the Ecc column header from "Ecc" to "Med. Ecc".
- These are confirmed medians computed via `statistics.median()` in the backend at `targets.py:1016-1017`.

### 3. Session Metrics Chart

Replaces the removed best/worst frame area. A collapsible Chart.js line chart within each expanded session.

**Data source:** `SessionDetail.frames[]` — per-frame records with timestamps and all metric fields.

**X-axis:** Frame capture time (within the session's time span).

**Available metrics (Y-axis):**
- HFR
- Eccentricity
- FWHM
- Guiding RMS (total)
- Detected Stars
- Sensor Temp
- Ambient Temp
- Humidity
- Cloud Cover
- Airmass

**Default enabled:** HFR, Eccentricity, FWHM, Guiding RMS.

**Toggle pills:** Colored pill buttons above the chart. Active = colored border + tinted background. Inactive = muted border and text. Clicking toggles the metric line on/off.

**Filter overlay:** A second row of toggle pills for filter selection:
- "Overall" (all frames combined) — enabled by default
- One pill per filter used in the session (Ha, R, G, B, etc.)
- When a filter is selected, the chart shows separate lines for that filter's frames, using the filter's theme color
- Multiple filters can be active simultaneously

**Collapsible:** Collapsed by default. Toggle button labeled "Session Metrics" with expand/collapse indicator.

**Dual Y-axes:** Chart.js supports multiple Y-axes. Metrics with different scales (e.g., HFR ~1-4 vs Stars ~100-300) get separate axes. Group by scale similarity:
- Left axis: HFR, Eccentricity (small decimals)
- Right axis: FWHM, Stars, Guiding RMS (larger values)

**Tooltips:** On hover, show the frame's timestamp and all active metric values.

### 4. Target Metrics Chart

A new collapsible chart on the target detail page showing metrics across all sessions.

**Placement:** Below the stat cards row (Total Integration, Total Frames, Avg HFR, etc.), collapsed by default.

**Trigger:** A "Metrics Trend" button at the right end of the stat cards row. Clicking expands/collapses the chart.

**Data source:** Session overview data already loaded on the target page (`SessionOverview[]`). Each data point = one session's median value. `SessionOverview` has overall medians (HFR, Eccentricity, FWHM, Stars, Guiding RMS) but no per-filter breakdowns.

**X-axis:** Session dates.

**Y-axis, toggles:** Same metric toggle pills as session chart.

**Filter overlay:** The target chart defaults to "Overall" only. Per-filter overlay requires per-filter medians not present in `SessionOverview`. To support this, add a `filter_medians` field to `SessionOverview`:

```python
class FilterMedian(BaseModel):
    filter_name: str
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    median_fwhm: float | None = None
    median_guiding_rms: float | None = None
    median_detected_stars: float | None = None

class SessionOverview(BaseModel):
    # ... existing fields ...
    filter_medians: list[FilterMedian] = []
```

This keeps the target chart fully functional without needing to lazy-load session details.

**Session selection:** When the target chart is expanded, checkboxes appear on each session row. Users can include/exclude individual sessions from the chart. A "Select All / None" toggle in the chart header controls bulk selection. All sessions selected by default.

### 5. Graph Settings Persistence

**New type:** `GraphSettings` added to the settings system, persisted independently from existing `DisplaySettings`.

```typescript
interface GraphSettings {
  enabled_metrics: string[];    // e.g. ["hfr", "eccentricity", "fwhm", "guiding_rms"]
  enabled_filters: string[];    // e.g. ["overall"] — filter names or "overall"
  session_chart_expanded: boolean;
  target_chart_expanded: boolean;
}
```

**Storage:** Saved via a new backend endpoint `PUT /settings/graph` alongside existing settings endpoints. Stored in the same `user_settings` database table.

**Scope:** Global — applies to all sessions across all targets. When the user toggles a metric on/off, it persists and applies everywhere.

**Independence:** Graph toggles do NOT affect the per-frame table column visibility (which uses `DisplaySettings`). They are separate controls.

### 6. Chart Library

**Chart.js** via `solid-chartjs` wrapper.

- `chart.js` — core library (~65KB gzipped)
- `solid-chartjs` — SolidJS integration
- `chartjs-plugin-zoom` — optional, for pan/zoom on dense sessions

**Theme integration:** Chart colors use CSS custom property values read at render time from the theme tokens (`--color-metric-hfr`, `--color-metric-eccentricity`, etc.). Charts re-render on theme change.

### 7. Backend Changes

**No new API endpoints for chart data.** Existing endpoints serve the data with minor additions:
- Session chart: `SessionDetail.frames[]` already contains per-frame metrics with timestamps
- Target chart: `SessionOverview[]` already contains per-session overall medians; add `filter_medians` field (list of per-filter medians) for filter overlay support

**New endpoint:** `GET /settings/graph` and `PUT /settings/graph` for graph settings persistence.

**Schema change:** Add `GraphSettings` to the settings Pydantic models and database schema.

**FilterDetail cleanup:** The `best_frame` and `worst_frame` fields can be removed from `FilterDetail` since the UI no longer uses them. The backend computation (lines 996-1020 in `targets.py`) can be removed to save processing time.

## Components

### New Components
- `SessionMetricsChart` — Chart.js line chart for per-frame metrics within a session
- `TargetMetricsChart` — Chart.js line chart for cross-session metrics on a target
- `MetricTogglePills` — Shared component for metric on/off pills (used by both charts)
- `FilterTogglePills` — Shared component for filter selection pills (used by both charts)

### Modified Components
- `SessionAccordionCard` — remove best/worst columns, restructure summary as table, add session chart
- `TargetDetailPage` — add target chart below stat cards, add "Metrics Trend" button, add session checkboxes

### Modified Backend
- `targets.py` — remove best/worst frame computation from session detail endpoint
- `target.py` (schemas) — remove `best_frame`/`worst_frame` from `FilterDetail`, add `GraphSettings`, add `FilterMedian` and `filter_medians` to `SessionOverview`
- `settings.ts` (frontend store) — add `loadGraphSettings()` / `saveGraphSettings()`
- `types/index.ts` — add `GraphSettings` interface

## Data Flow

```
Target Page loads → SessionOverview[] already has per-session medians
  ↓
User clicks "Metrics Trend" → TargetMetricsChart renders from SessionOverview data
  ↓
User expands a session → SessionDetail loaded (includes frames[])
  ↓
Session chart renders from frames[] data, filtered by active metrics/filters
  ↓
User toggles metric/filter → GraphSettings updated → saved to backend
  ↓
Next session/target visited → GraphSettings loaded → same toggles applied
```

## Non-Goals

- No zoom/pan on charts in initial implementation (can add `chartjs-plugin-zoom` later)
- No chart export/download
- No per-target or per-session override of graph settings (global only)
- No new API endpoints for aggregated chart data — use existing data
