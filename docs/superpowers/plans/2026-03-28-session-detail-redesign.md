# Session Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the expanded session detail view with a summary table, remove best/worst frames, add Chart.js metric graphs at session and target levels, and persist graph toggle settings.

**Architecture:** Backend adds `graph` JSONB column to `user_settings`, `filter_medians` to `SessionOverview`, and removes best/worst frame computation. Frontend adds Chart.js via `solid-chartjs`, new chart components, metric/filter toggle pills, and a graph settings store. Session chart plots per-frame data; target chart plots per-session medians.

**Tech Stack:** SolidJS, Chart.js (`chart.js` + `solid-chartjs`), FastAPI, Pydantic, SQLAlchemy, Alembic, Tailwind CSS v4

---

## File Structure

### New Files
- `frontend/src/components/MetricTogglePills.tsx` — Shared metric on/off pill buttons
- `frontend/src/components/FilterTogglePills.tsx` — Shared filter selection pill buttons
- `frontend/src/components/SessionMetricsChart.tsx` — Chart.js line chart for per-frame session metrics
- `frontend/src/components/TargetMetricsChart.tsx` — Chart.js line chart for cross-session target metrics
- `frontend/src/store/graphSettings.ts` — Graph settings state management (load/save)
- `frontend/src/utils/chartConfig.ts` — Shared chart configuration (metric definitions, colors, axis grouping)
- `backend/alembic/versions/0008_add_graph_settings_column.py` — Migration to add `graph` column
- `backend/tests/test_api_graph_settings.py` — Tests for graph settings endpoints

### Modified Files
- `backend/app/schemas/settings.py` — Add `GraphSettings` model, add to `SettingsResponse`
- `backend/app/schemas/target.py` — Add `FilterMedian` model, add `filter_medians` to `SessionOverview`, remove `best_frame`/`worst_frame` from `FilterDetail`
- `backend/app/models/user_settings.py` — Add `graph` JSONB column
- `backend/app/api/settings.py` — Add `GET/PUT /settings/graph` endpoints
- `backend/app/api/targets.py` — Remove best/worst frame computation, add `filter_medians` to session overview
- `backend/tests/test_api_settings.py` — Update `_make_settings_row` to include `display` and `graph`
- `backend/tests/test_schemas_settings.py` — Add test for `GraphSettings` defaults
- `frontend/package.json` — Add `chart.js` and `solid-chartjs` dependencies
- `frontend/src/types/index.ts` — Add `GraphSettings`, `FilterMedian` types; update `SessionOverview`, `FilterDetail`, `SettingsResponse`
- `frontend/src/api/client.ts` — Add `getGraphSettings()` and `updateGraphSettings()` endpoints
- `frontend/src/store/settings.ts` — Add graph settings load/save
- `frontend/src/components/SettingsProvider.tsx` — Expose graph settings in context
- `frontend/src/components/SessionAccordionCard.tsx` — Remove best/worst columns, restructure summary table, add session chart
- `frontend/src/pages/TargetDetailPage.tsx` — Add target chart, "Metrics Trend" button, session checkboxes

---

## Task 1: Backend — Add GraphSettings Schema and Migration

**Files:**
- Modify: `backend/app/schemas/settings.py:1-98`
- Modify: `backend/app/models/user_settings.py:1-36`
- Create: `backend/alembic/versions/0008_add_graph_settings_column.py`

- [ ] **Step 1: Add GraphSettings to settings schema**

In `backend/app/schemas/settings.py`, add `GraphSettings` class after `DisplaySettings` (after line 40) and add a `default_graph_settings()` factory. Also add `graph` field to `SettingsResponse`.

```python
# Add after line 40 (after DisplaySettings class):

class GraphSettings(BaseModel):
    enabled_metrics: list[str] = Field(
        default_factory=lambda: ["hfr", "eccentricity", "fwhm", "guiding_rms"]
    )
    enabled_filters: list[str] = Field(default_factory=lambda: ["overall"])
    session_chart_expanded: bool = False
    target_chart_expanded: bool = False


def default_graph_settings() -> GraphSettings:
    return GraphSettings()
```

In `SettingsResponse` (line 72), add the `graph` field:

```python
class SettingsResponse(BaseModel):
    general: GeneralSettings
    filters: dict[str, FilterConfig]
    equipment: EquipmentConfig
    dismissed_suggestions: list[list[str]] = Field(default_factory=list)
    display: DisplaySettings = Field(default_factory=default_display_settings)
    graph: GraphSettings = Field(default_factory=default_graph_settings)
```

- [ ] **Step 2: Add graph column to UserSettings model**

In `backend/app/models/user_settings.py`, add `graph` JSONB column after `display` (after line 21):

```python
graph: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
```

Also add `kwargs.setdefault("graph", {})` in `__init__` (after line 34).

- [ ] **Step 3: Create Alembic migration**

Create `backend/alembic/versions/0008_add_graph_settings_column.py`:

```python
"""Add graph settings column to user_settings table."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("graph", JSONB, nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "graph")
```

- [ ] **Step 4: Run migration**

Run: `cd backend && alembic upgrade head`
Expected: Migration 0008 applied successfully.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/settings.py backend/app/models/user_settings.py backend/alembic/versions/0008_add_graph_settings_column.py
git commit -m "feat: add GraphSettings schema, model column, and migration"
```

---

## Task 2: Backend — Add Graph Settings Endpoints

**Files:**
- Modify: `backend/app/api/settings.py:1-370`
- Create: `backend/tests/test_api_graph_settings.py`

- [ ] **Step 1: Write test for GET /settings including graph defaults**

Create `backend/tests/test_api_graph_settings.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import get_session
from app.models.user_settings import SETTINGS_ROW_ID


def _make_settings_row(general=None, filters=None, equipment=None, dismissed_suggestions=None, display=None, graph=None):
    row = MagicMock()
    row.id = SETTINGS_ROW_ID
    row.general = general if general is not None else {}
    row.filters = filters if filters is not None else {}
    row.equipment = equipment if equipment is not None else {}
    row.dismissed_suggestions = dismissed_suggestions if dismissed_suggestions is not None else []
    row.display = display if display is not None else {}
    row.graph = graph if graph is not None else {}
    return row


@pytest.mark.asyncio
async def test_get_settings_includes_graph_defaults():
    row = _make_settings_row()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = row
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "graph" in data
        assert data["graph"]["enabled_metrics"] == ["hfr", "eccentricity", "fwhm", "guiding_rms"]
        assert data["graph"]["enabled_filters"] == ["overall"]
        assert data["graph"]["session_chart_expanded"] is False
        assert data["graph"]["target_chart_expanded"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_put_graph_settings():
    row = _make_settings_row()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = row
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "enabled_metrics": ["hfr", "fwhm"],
                "enabled_filters": ["overall", "Ha"],
                "session_chart_expanded": True,
                "target_chart_expanded": False,
            }
            resp = await client.put("/api/settings/graph", json=payload)
        assert resp.status_code == 200
        # Verify the row was updated
        assert row.graph == payload
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_api_graph_settings.py -v`
Expected: FAIL — endpoint doesn't exist yet.

- [ ] **Step 3: Add graph settings endpoints and update _row_to_response**

In `backend/app/api/settings.py`, add the import for `GraphSettings` and `default_graph_settings` at line 12:

```python
from app.schemas.settings import (
    GeneralSettings, FilterConfig, EquipmentConfig, EquipmentAliases,
    SettingsResponse, SuggestionsResponse, SuggestionGroup,
    DiscoveredItem, DiscoveredResponse,
    DisplaySettings, default_display_settings,
    GraphSettings, default_graph_settings,
)
```

Update `_row_to_response` (line 55) to include `graph`:

```python
def _row_to_response(row: UserSettings) -> SettingsResponse:
    """Convert a UserSettings ORM row to a SettingsResponse schema."""
    general_data = row.general or {}
    filters_data = row.filters or {}
    equipment_data = row.equipment or {}

    general = GeneralSettings(**general_data)

    filters = {
        name: FilterConfig(**cfg)
        for name, cfg in filters_data.items()
    }

    eq_cameras = {
        name: EquipmentAliases(**aliases)
        for name, aliases in equipment_data.get("cameras", {}).items()
    }
    eq_telescopes = {
        name: EquipmentAliases(**aliases)
        for name, aliases in equipment_data.get("telescopes", {}).items()
    }
    equipment = EquipmentConfig(cameras=eq_cameras, telescopes=eq_telescopes)

    display = DisplaySettings(**row.display) if row.display else default_display_settings()
    graph = GraphSettings(**row.graph) if row.graph else default_graph_settings()

    return SettingsResponse(
        general=general,
        filters=filters,
        equipment=equipment,
        dismissed_suggestions=row.dismissed_suggestions or [],
        display=display,
        graph=graph,
    )
```

Add the PUT endpoint after the `update_display` endpoint (after line 262):

```python
@router.put("/graph")
async def update_graph(
    payload: GraphSettings,
    session: AsyncSession = Depends(get_session),
):
    row = await _get_or_create_settings(session)
    row.graph = payload.model_dump()
    await session.commit()
    return _row_to_response(row)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_graph_settings.py -v`
Expected: PASS

- [ ] **Step 5: Update existing settings test helper**

In `backend/tests/test_api_settings.py`, update `_make_settings_row` to include `display` and `graph`:

```python
def _make_settings_row(
    general=None,
    filters=None,
    equipment=None,
    dismissed_suggestions=None,
    display=None,
    graph=None,
):
    """Return a MagicMock that looks like a UserSettings ORM row."""
    row = MagicMock()
    row.id = SETTINGS_ROW_ID
    row.general = general if general is not None else {}
    row.filters = filters if filters is not None else {}
    row.equipment = equipment if equipment is not None else {}
    row.dismissed_suggestions = dismissed_suggestions if dismissed_suggestions is not None else []
    row.display = display if display is not None else {}
    row.graph = graph if graph is not None else {}
    return row
```

- [ ] **Step 6: Run all settings tests**

Run: `cd backend && python -m pytest tests/test_api_settings.py tests/test_api_graph_settings.py tests/test_schemas_settings.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/settings.py backend/tests/test_api_graph_settings.py backend/tests/test_api_settings.py
git commit -m "feat: add GET/PUT /settings/graph endpoints with tests"
```

---

## Task 3: Backend — Add FilterMedian to SessionOverview and Remove Best/Worst Frames

**Files:**
- Modify: `backend/app/schemas/target.py:1-236`
- Modify: `backend/app/api/targets.py:280-320` (session overview) and `985-1021` (session detail)

- [ ] **Step 1: Update target schemas**

In `backend/app/schemas/target.py`, add `FilterMedian` class before `SessionOverview` (before line 33):

```python
class FilterMedian(BaseModel):
    filter_name: str
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    median_fwhm: float | None = None
    median_guiding_rms: float | None = None
    median_detected_stars: float | None = None
```

Add `filter_medians` field to `SessionOverview` (after line 44):

```python
class SessionOverview(BaseModel):
    session_date: str
    integration_seconds: float
    frame_count: int
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    filters_used: list[str]
    camera: str | None = None
    telescope: str | None = None
    median_fwhm: float | None = None
    median_detected_stars: float | None = None
    median_guiding_rms_arcsec: float | None = None
    filter_medians: list[FilterMedian] = []
```

Remove `best_frame` and `worst_frame` from `FilterDetail`:

```python
class FilterDetail(BaseModel):
    filter_name: str
    frame_count: int
    integration_seconds: float
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    exposure_time: float | None = None
```

`FrameHighlight` class can remain for now (it's referenced by existing tests) but is no longer used by `FilterDetail`.

- [ ] **Step 2: Update frontend types to match**

In `frontend/src/types/index.ts`, add `FilterMedian` interface before `SessionOverview` (before line 80):

```typescript
export interface FilterMedian {
  filter_name: string;
  median_hfr: number | null;
  median_eccentricity: number | null;
  median_fwhm: number | null;
  median_guiding_rms: number | null;
  median_detected_stars: number | null;
}
```

Add `filter_medians` to `SessionOverview`:

```typescript
export interface SessionOverview {
  session_date: string;
  integration_seconds: number;
  frame_count: number;
  median_hfr: number | null;
  median_eccentricity: number | null;
  filters_used: string[];
  camera: string | null;
  telescope: string | null;
  median_fwhm: number | null;
  median_detected_stars: number | null;
  median_guiding_rms_arcsec: number | null;
  filter_medians: FilterMedian[];
}
```

Remove `best_frame` and `worst_frame` from `FilterDetail`:

```typescript
export interface FilterDetail {
  filter_name: string;
  frame_count: number;
  integration_seconds: number;
  median_hfr: number | null;
  median_eccentricity: number | null;
  exposure_time: number | null;
}
```

Add `GraphSettings` interface and update `SettingsResponse`:

```typescript
export interface GraphSettings {
  enabled_metrics: string[];
  enabled_filters: string[];
  session_chart_expanded: boolean;
  target_chart_expanded: boolean;
}

export interface SettingsResponse {
  general: GeneralSettings;
  filters: Record<string, FilterConfig>;
  equipment: EquipmentConfig;
  dismissed_suggestions: string[][];
  display: DisplaySettings;
  graph: GraphSettings;
}
```

- [ ] **Step 3: Update backend target detail — add filter_medians to SessionOverview**

In `backend/app/api/targets.py`, update the session overview construction (around line 296). Import `FilterMedian` at the top alongside existing schema imports. Then inside the `for date_key in sorted(sessions_map.keys(), reverse=True):` loop, after computing `sess_guiding_rms`, add per-filter median computation:

```python
        # Per-filter medians for chart overlay
        filter_groups: dict[str, list] = defaultdict(list)
        for img in sess_images:
            f = normalize_filter(img.filter_used, filter_map)
            if f:
                filter_groups[f].append(img)

        sess_filter_medians = []
        for fname, fimages in sorted(filter_groups.items()):
            f_hfr = [i.median_hfr for i in fimages if i.median_hfr is not None]
            f_ecc = [i.eccentricity for i in fimages if i.eccentricity is not None]
            f_fwhm = [i.fwhm for i in fimages if i.fwhm is not None]
            f_guiding = [i.guiding_rms_arcsec for i in fimages if i.guiding_rms_arcsec is not None]
            f_stars = [i.detected_stars for i in fimages if i.detected_stars is not None]
            sess_filter_medians.append(FilterMedian(
                filter_name=fname,
                median_hfr=statistics.median(f_hfr) if f_hfr else None,
                median_eccentricity=statistics.median(f_ecc) if f_ecc else None,
                median_fwhm=statistics.median(f_fwhm) if f_fwhm else None,
                median_guiding_rms=statistics.median(f_guiding) if f_guiding else None,
                median_detected_stars=statistics.median(f_stars) if f_stars else None,
            ))
```

Then add `filter_medians=sess_filter_medians` to the `SessionOverview(...)` constructor call.

- [ ] **Step 4: Remove best/worst frame computation from session detail**

In `backend/app/api/targets.py`, in the session detail endpoint (around line 985-1021), remove the best/worst frame logic. Replace the `filter_details` loop body:

```python
    filter_details = []
    for fname, fimages in sorted(filter_groups.items()):
        f_hfr = [i.median_hfr for i in fimages if i.median_hfr is not None]
        f_ecc = [i.eccentricity for i in fimages if i.eccentricity is not None]
        f_exp = sum(i.exposure_time or 0 for i in fimages)
        filter_details.append(FilterDetail(
            filter_name=fname,
            frame_count=len(fimages),
            integration_seconds=f_exp,
            median_hfr=statistics.median(f_hfr) if f_hfr else None,
            median_eccentricity=statistics.median(f_ecc) if f_ecc else None,
            exposure_time=fimages[0].exposure_time,
        ))
```

- [ ] **Step 5: Run backend tests**

Run: `cd backend && python -m pytest tests/test_api_target_detail.py tests/test_schemas_target.py -v`
Expected: May need to update tests that reference `best_frame`/`worst_frame`. Fix any failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/target.py backend/app/api/targets.py frontend/src/types/index.ts
git commit -m "feat: add filter_medians to SessionOverview, remove best/worst frames"
```

---

## Task 4: Frontend — Install Chart.js and Add Graph Settings Store

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/store/graphSettings.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/store/settings.ts`
- Modify: `frontend/src/components/SettingsProvider.tsx`

- [ ] **Step 1: Install Chart.js dependencies**

Run: `cd frontend && npm install chart.js solid-chartjs`

- [ ] **Step 2: Add API client methods for graph settings**

In `frontend/src/api/client.ts`, add the import for `GraphSettings` at line 1:

```typescript
import type {
  TargetAggregationResponse,
  SessionDetail,
  EquipmentList,
  TargetSearchResult,
  TargetSearchResultFuzzy,
  ObjectTypeCount,
  MergeCandidateResponse,
  MergedTargetResponse,
  ScanResult,
  ScanStatus,
  ActiveFilters,
  StatsResponse,
  TargetDetailResponse,
  SettingsResponse,
  GeneralSettings,
  FilterConfig,
  EquipmentConfig,
  SuggestionsResponse,
  DiscoveredResponse,
  DisplaySettings,
  GraphSettings,
} from "../types";
```

Add after `updateDisplay` (after line 176):

```typescript
  updateGraph: (graph: GraphSettings) =>
    fetchJson<SettingsResponse>("/settings/graph", {
      method: "PUT",
      body: JSON.stringify(graph),
    }),
```

- [ ] **Step 3: Create graph settings store**

Create `frontend/src/store/graphSettings.ts`:

```typescript
import { createSignal } from "solid-js";
import { api } from "../api/client";
import type { GraphSettings } from "../types";

const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  enabled_metrics: ["hfr", "eccentricity", "fwhm", "guiding_rms"],
  enabled_filters: ["overall"],
  session_chart_expanded: false,
  target_chart_expanded: false,
};

const [graphSettings, setGraphSettings] = createSignal<GraphSettings>(DEFAULT_GRAPH_SETTINGS);
let loaded = false;

export function useGraphSettings() {
  return {
    graphSettings,

    async loadGraphSettings() {
      if (loaded) return;
      try {
        const resp = await api.getSettings();
        if (resp.graph) {
          setGraphSettings(resp.graph);
        }
        loaded = true;
      } catch {
        // Use defaults on error
      }
    },

    async saveGraphSettings(updates: Partial<GraphSettings>) {
      const current = graphSettings();
      const next = { ...current, ...updates };
      setGraphSettings(next);
      try {
        await api.updateGraph(next);
      } catch {
        // Revert on error
        setGraphSettings(current);
      }
    },

    toggleMetric(metric: string) {
      const current = graphSettings();
      const metrics = current.enabled_metrics.includes(metric)
        ? current.enabled_metrics.filter((m) => m !== metric)
        : [...current.enabled_metrics, metric];
      const next = { ...current, enabled_metrics: metrics };
      setGraphSettings(next);
      api.updateGraph(next).catch(() => setGraphSettings(current));
    },

    toggleFilter(filter: string) {
      const current = graphSettings();
      const filters = current.enabled_filters.includes(filter)
        ? current.enabled_filters.filter((f) => f !== filter)
        : [...current.enabled_filters, filter];
      const next = { ...current, enabled_filters: filters };
      setGraphSettings(next);
      api.updateGraph(next).catch(() => setGraphSettings(current));
    },
  };
}
```

- [ ] **Step 4: Expose graph settings in SettingsProvider**

In `frontend/src/components/SettingsProvider.tsx`, add the import and integrate:

```typescript
import { createContext, useContext, createEffect, type ParentComponent } from "solid-js";
import { useSettings, getFilterColorMap, getFilterAliasMap } from "../store/settings";
import { useGraphSettings } from "../store/graphSettings";
import type { SettingsResponse, GeneralSettings, FilterConfig, EquipmentConfig, DisplaySettings, GraphSettings } from "../types";
import type { Resource } from "solid-js";
import type { FilterBadgeStyle } from "../utils/filterStyles";
import { applyTheme, applyTextSize, DEFAULT_THEME_ID, DEFAULT_TEXT_SIZE } from "../themes";

interface SettingsContextValue {
  settings: Resource<SettingsResponse | undefined>;
  filterColorMap: () => Record<string, string>;
  filterAliasMap: () => Record<string, string>;
  filterBadgeStyle: () => FilterBadgeStyle;
  saveGeneral: (g: GeneralSettings) => Promise<SettingsResponse>;
  saveFilters: (f: Record<string, FilterConfig>) => Promise<SettingsResponse>;
  saveEquipment: (e: EquipmentConfig) => Promise<SettingsResponse>;
  refetchSettings: () => void;
  displaySettings: () => DisplaySettings | undefined;
  saveDisplay: (display: DisplaySettings) => Promise<void>;
  graphSettings: () => GraphSettings;
  toggleMetric: (metric: string) => void;
  toggleFilter: (filter: string) => void;
  saveGraphSettings: (updates: Partial<GraphSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>();

export const SettingsProvider: ParentComponent = (props) => {
  const store = useSettings();
  const graphStore = useGraphSettings();

  // Load graph settings on mount
  graphStore.loadGraphSettings();

  // Apply theme and text size whenever settings change
  createEffect(() => {
    const themeId = store.settings()?.general.theme ?? DEFAULT_THEME_ID;
    applyTheme(themeId);
  });

  createEffect(() => {
    const sizeId = store.settings()?.general.text_size ?? DEFAULT_TEXT_SIZE;
    applyTextSize(sizeId);
  });

  const value: SettingsContextValue = {
    settings: store.settings,
    filterColorMap: () => getFilterColorMap(store.settings()),
    filterAliasMap: () => getFilterAliasMap(store.settings()),
    filterBadgeStyle: () => (store.settings()?.general.filter_style as FilterBadgeStyle) || "solid",
    saveGeneral: store.saveGeneral,
    saveFilters: store.saveFilters,
    saveEquipment: store.saveEquipment,
    refetchSettings: store.refetchSettings,
    displaySettings: () => store.settings()?.display,
    saveDisplay: store.saveDisplay,
    graphSettings: graphStore.graphSettings,
    toggleMetric: graphStore.toggleMetric,
    toggleFilter: graphStore.toggleFilter,
    saveGraphSettings: graphStore.saveGraphSettings,
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

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/store/graphSettings.ts frontend/src/api/client.ts frontend/src/components/SettingsProvider.tsx
git commit -m "feat: install Chart.js, add graph settings store and API"
```

---

## Task 5: Frontend — Chart Configuration and Toggle Components

**Files:**
- Create: `frontend/src/utils/chartConfig.ts`
- Create: `frontend/src/components/MetricTogglePills.tsx`
- Create: `frontend/src/components/FilterTogglePills.tsx`

- [ ] **Step 1: Create chart configuration utility**

Create `frontend/src/utils/chartConfig.ts`:

```typescript
export interface MetricDefinition {
  key: string;
  label: string;
  colorVar: string;       // CSS variable name e.g. "--color-metric-hfr"
  yAxisId: "left" | "right";
  frameField: string;     // field name on FrameRecord
  overviewField: string;  // field name on SessionOverview
  decimals: number;
  unit?: string;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: "hfr", label: "HFR", colorVar: "--color-metric-hfr", yAxisId: "left", frameField: "median_hfr", overviewField: "median_hfr", decimals: 2 },
  { key: "eccentricity", label: "Ecc", colorVar: "--color-metric-eccentricity", yAxisId: "left", frameField: "eccentricity", overviewField: "median_eccentricity", decimals: 2 },
  { key: "fwhm", label: "FWHM", colorVar: "--color-metric-fwhm", yAxisId: "right", frameField: "fwhm", overviewField: "median_fwhm", decimals: 1 },
  { key: "guiding_rms", label: "Guide", colorVar: "--color-metric-guiding", yAxisId: "left", frameField: "guiding_rms_arcsec", overviewField: "median_guiding_rms_arcsec", decimals: 2, unit: '"' },
  { key: "detected_stars", label: "Stars", colorVar: "--color-metric-stars", yAxisId: "right", frameField: "detected_stars", overviewField: "median_detected_stars", decimals: 0 },
  { key: "sensor_temp", label: "Temp", colorVar: "--color-metric-temp", yAxisId: "right", frameField: "sensor_temp", overviewField: "", decimals: 0, unit: "°C" },
  { key: "ambient_temp", label: "Ambient", colorVar: "--color-metric-temp", yAxisId: "right", frameField: "ambient_temp", overviewField: "", decimals: 1, unit: "°C" },
  { key: "humidity", label: "Humidity", colorVar: "--color-metric-temp", yAxisId: "right", frameField: "humidity", overviewField: "", decimals: 0, unit: "%" },
  { key: "cloud_cover", label: "Cloud", colorVar: "--color-metric-temp", yAxisId: "right", frameField: "cloud_cover", overviewField: "", decimals: 0, unit: "%" },
  { key: "airmass", label: "Airmass", colorVar: "--color-metric-temp", yAxisId: "right", frameField: "airmass", overviewField: "", decimals: 2 },
];

export function getMetricColor(colorVar: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
}

export function getMetricDef(key: string): MetricDefinition | undefined {
  return METRIC_DEFINITIONS.find((m) => m.key === key);
}
```

- [ ] **Step 2: Create MetricTogglePills component**

Create `frontend/src/components/MetricTogglePills.tsx`:

```tsx
import { For } from "solid-js";
import { METRIC_DEFINITIONS, getMetricColor } from "../utils/chartConfig";
import { useSettingsContext } from "./SettingsProvider";

interface Props {
  /** Optionally limit to a subset of metric keys */
  availableMetrics?: string[];
}

export default function MetricTogglePills(props: Props) {
  const { graphSettings, toggleMetric } = useSettingsContext();

  const metrics = () => {
    if (props.availableMetrics) {
      return METRIC_DEFINITIONS.filter((m) => props.availableMetrics!.includes(m.key));
    }
    return METRIC_DEFINITIONS;
  };

  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={metrics()}>
        {(metric) => {
          const isActive = () => graphSettings().enabled_metrics.includes(metric.key);
          const color = () => getMetricColor(metric.colorVar);
          return (
            <button
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer"
              style={{
                "border-color": isActive() ? color() : "var(--color-border-default)",
                "background-color": isActive() ? `${color()}22` : "var(--color-bg-elevated)",
                color: isActive() ? color() : "var(--color-text-tertiary)",
              }}
              onClick={() => toggleMetric(metric.key)}
            >
              {metric.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
```

- [ ] **Step 3: Create FilterTogglePills component**

Create `frontend/src/components/FilterTogglePills.tsx`:

```tsx
import { For } from "solid-js";
import { useSettingsContext } from "./SettingsProvider";

interface Props {
  /** Filter names available in the current context */
  filters: string[];
}

export default function FilterTogglePills(props: Props) {
  const { graphSettings, toggleFilter, filterColorMap } = useSettingsContext();

  const allFilters = () => ["overall", ...props.filters];

  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={allFilters()}>
        {(filter) => {
          const isActive = () => graphSettings().enabled_filters.includes(filter);
          const color = () => {
            if (filter === "overall") return "var(--color-info)";
            return filterColorMap()[filter] ?? "var(--color-text-secondary)";
          };
          return (
            <button
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer"
              style={{
                "border-color": isActive() ? color() : "var(--color-border-default)",
                "background-color": isActive() ? `color-mix(in srgb, ${color()} 13%, transparent)` : "var(--color-bg-elevated)",
                color: isActive() ? color() : "var(--color-text-tertiary)",
              }}
              onClick={() => toggleFilter(filter)}
            >
              {filter === "overall" ? "Overall" : filter}
            </button>
          );
        }}
      </For>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/chartConfig.ts frontend/src/components/MetricTogglePills.tsx frontend/src/components/FilterTogglePills.tsx
git commit -m "feat: add chart config utility and metric/filter toggle pill components"
```

---

## Task 6: Frontend — Session Metrics Chart Component

**Files:**
- Create: `frontend/src/components/SessionMetricsChart.tsx`

- [ ] **Step 1: Create SessionMetricsChart**

Create `frontend/src/components/SessionMetricsChart.tsx`:

```tsx
import { createMemo, createSignal, Show, onMount } from "solid-js";
import { Chart, Title, Tooltip, Legend, Colors, Filler } from "chart.js";
import { Line } from "solid-chartjs";
import type { SessionDetail, FrameRecord } from "../types";
import { useSettingsContext } from "./SettingsProvider";
import { METRIC_DEFINITIONS, getMetricColor, getMetricDef } from "../utils/chartConfig";
import MetricTogglePills from "./MetricTogglePills";
import FilterTogglePills from "./FilterTogglePills";
import "chart.js/auto";

interface Props {
  detail: SessionDetail;
}

export default function SessionMetricsChart(props: Props) {
  const { graphSettings, saveGraphSettings } = useSettingsContext();
  const [expanded, setExpanded] = createSignal(graphSettings().session_chart_expanded);

  const filters = () => props.detail.filter_details.map((f) => f.filter_name);

  const chartData = createMemo(() => {
    const enabledMetrics = graphSettings().enabled_metrics;
    const enabledFilters = graphSettings().enabled_filters;
    const frames = [...props.detail.frames].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const labels = frames.map((f) => {
      const d = new Date(f.timestamp);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });

    const datasets: any[] = [];

    for (const metricKey of enabledMetrics) {
      const def = getMetricDef(metricKey);
      if (!def) continue;
      const color = getMetricColor(def.colorVar);
      const field = def.frameField as keyof FrameRecord;

      if (enabledFilters.includes("overall")) {
        datasets.push({
          label: def.label,
          data: frames.map((f) => f[field] ?? null),
          borderColor: color,
          backgroundColor: `${color}33`,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: true,
          yAxisID: def.yAxisId,
        });
      }

      // Per-filter datasets
      for (const filterName of enabledFilters) {
        if (filterName === "overall") continue;
        const filterColor = getComputedStyle(document.documentElement)
          .getPropertyValue(`--color-filter-${filterName.toLowerCase()}`)
          .trim() || color;

        datasets.push({
          label: `${def.label} (${filterName})`,
          data: frames.map((f) =>
            f.filter_used === filterName ? (f[field] ?? null) : null
          ),
          borderColor: filterColor,
          backgroundColor: `${filterColor}33`,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: false,
          yAxisID: def.yAxisId,
          borderDash: [4, 2],
        });
      }
    }

    return { labels, datasets };
  });

  const chartOptions = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleFont: { size: 11 },
        bodyFont: { size: 10 },
        padding: 8,
      },
    },
    scales: {
      x: {
        ticks: {
          color: "var(--color-text-tertiary)",
          font: { size: 9 },
          maxTicksLimit: 10,
        },
        grid: {
          color: "rgba(255,255,255,0.05)",
        },
      },
      left: {
        type: "linear" as const,
        position: "left" as const,
        ticks: {
          color: "var(--color-text-tertiary)",
          font: { size: 9 },
        },
        grid: {
          color: "rgba(255,255,255,0.05)",
        },
      },
      right: {
        type: "linear" as const,
        position: "right" as const,
        ticks: {
          color: "var(--color-text-tertiary)",
          font: { size: 9 },
        },
        grid: { drawOnChartArea: false },
      },
    },
  }));

  const toggleExpanded = () => {
    const next = !expanded();
    setExpanded(next);
    saveGraphSettings({ session_chart_expanded: next });
  };

  return (
    <div>
      <button
        class="flex justify-between items-center w-full text-xs py-2.5 px-3 -mx-3 rounded-lg hover:bg-theme-elevated transition-colors cursor-pointer"
        onClick={toggleExpanded}
      >
        <span class="font-bold text-theme-text-primary">Session Metrics</span>
        <span class="px-2.5 py-1 border border-theme-border-em rounded text-[11px] text-theme-text-secondary hover:text-theme-text-primary hover:border-theme-accent transition-colors">
          {expanded() ? "Collapse" : "Expand"}
        </span>
      </button>
      <Show when={expanded()}>
        <div class="border border-theme-border rounded-lg p-3 bg-theme-base mt-2">
          <div class="flex justify-between items-start gap-4 mb-2">
            <div class="text-[9px] text-theme-text-tertiary uppercase tracking-wider">Metrics</div>
            <MetricTogglePills />
          </div>
          <div class="mb-3">
            <FilterTogglePills filters={filters()} />
          </div>
          <div style={{ height: "200px" }}>
            <Line data={chartData()} options={chartOptions()} />
          </div>
        </div>
      </Show>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SessionMetricsChart.tsx
git commit -m "feat: add SessionMetricsChart component with Chart.js"
```

---

## Task 7: Frontend — Target Metrics Chart Component

**Files:**
- Create: `frontend/src/components/TargetMetricsChart.tsx`

- [ ] **Step 1: Create TargetMetricsChart**

Create `frontend/src/components/TargetMetricsChart.tsx`:

```tsx
import { createMemo, createSignal, Show, For } from "solid-js";
import { Line } from "solid-chartjs";
import type { SessionOverview } from "../types";
import { useSettingsContext } from "./SettingsProvider";
import { METRIC_DEFINITIONS, getMetricColor, getMetricDef } from "../utils/chartConfig";
import MetricTogglePills from "./MetricTogglePills";
import FilterTogglePills from "./FilterTogglePills";
import "chart.js/auto";

/** Metrics available at the session overview level (have overviewField) */
const TARGET_METRICS = METRIC_DEFINITIONS.filter((m) => m.overviewField !== "");

interface Props {
  sessions: SessionOverview[];
  /** Set of selected session dates for the chart */
  selectedDates: Set<string>;
  onToggleDate: (date: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export default function TargetMetricsChart(props: Props) {
  const { graphSettings, saveGraphSettings } = useSettingsContext();
  const [expanded, setExpanded] = createSignal(graphSettings().target_chart_expanded);

  const allFilters = createMemo(() => {
    const filterSet = new Set<string>();
    for (const s of props.sessions) {
      for (const f of s.filters_used) filterSet.add(f);
    }
    return [...filterSet].sort();
  });

  const selectedSessions = createMemo(() =>
    [...props.sessions]
      .filter((s) => props.selectedDates.has(s.session_date))
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
  );

  const chartData = createMemo(() => {
    const enabledMetrics = graphSettings().enabled_metrics;
    const enabledFilters = graphSettings().enabled_filters;
    const sessions = selectedSessions();
    const labels = sessions.map((s) => s.session_date);

    const datasets: any[] = [];

    for (const metricKey of enabledMetrics) {
      const def = getMetricDef(metricKey);
      if (!def || !def.overviewField) continue;
      const color = getMetricColor(def.colorVar);
      const field = def.overviewField as keyof SessionOverview;

      if (enabledFilters.includes("overall")) {
        datasets.push({
          label: def.label,
          data: sessions.map((s) => (s[field] as number | null) ?? null),
          borderColor: color,
          backgroundColor: `${color}33`,
          borderWidth: 1.5,
          pointRadius: 3,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: true,
          yAxisID: def.yAxisId,
        });
      }

      // Per-filter datasets from filter_medians
      for (const filterName of enabledFilters) {
        if (filterName === "overall") continue;
        const filterMedField = `median_${metricKey}` as string;
        const filterColor = getComputedStyle(document.documentElement)
          .getPropertyValue(`--color-filter-${filterName.toLowerCase()}`)
          .trim() || color;

        datasets.push({
          label: `${def.label} (${filterName})`,
          data: sessions.map((s) => {
            const fm = s.filter_medians?.find((f) => f.filter_name === filterName);
            return fm ? ((fm as any)[filterMedField] ?? null) : null;
          }),
          borderColor: filterColor,
          backgroundColor: `${filterColor}33`,
          borderWidth: 1.5,
          pointRadius: 3,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: false,
          yAxisID: def.yAxisId,
          borderDash: [4, 2],
        });
      }
    }

    return { labels, datasets };
  });

  const chartOptions = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleFont: { size: 11 },
        bodyFont: { size: 10 },
        padding: 8,
      },
    },
    scales: {
      x: {
        ticks: {
          color: "var(--color-text-tertiary)",
          font: { size: 9 },
          maxRotation: 45,
        },
        grid: {
          color: "rgba(255,255,255,0.05)",
        },
      },
      left: {
        type: "linear" as const,
        position: "left" as const,
        ticks: {
          color: "var(--color-text-tertiary)",
          font: { size: 9 },
        },
        grid: {
          color: "rgba(255,255,255,0.05)",
        },
      },
      right: {
        type: "linear" as const,
        position: "right" as const,
        ticks: {
          color: "var(--color-text-tertiary)",
          font: { size: 9 },
        },
        grid: { drawOnChartArea: false },
      },
    },
  }));

  const toggleExpanded = () => {
    const next = !expanded();
    setExpanded(next);
    saveGraphSettings({ target_chart_expanded: next });
  };

  const availableMetricKeys = () => TARGET_METRICS.map((m) => m.key);

  return (
    <Show when={expanded()}>
      <div class="border border-theme-border rounded-lg p-3 bg-theme-base mb-4">
        <div class="flex justify-between items-start gap-4 mb-2">
          <div class="flex items-center gap-3">
            <div class="text-[9px] text-theme-text-tertiary uppercase tracking-wider">Target Metrics Across Sessions</div>
            <div class="flex gap-2 text-[9px]">
              <button
                class="text-theme-text-secondary hover:text-theme-text-primary cursor-pointer"
                onClick={props.onSelectAll}
              >
                Select All
              </button>
              <span class="text-theme-text-tertiary">|</span>
              <button
                class="text-theme-text-secondary hover:text-theme-text-primary cursor-pointer"
                onClick={props.onSelectNone}
              >
                None
              </button>
            </div>
          </div>
          <MetricTogglePills availableMetrics={availableMetricKeys()} />
        </div>
        <div class="mb-3">
          <FilterTogglePills filters={allFilters()} />
        </div>
        <div style={{ height: "200px" }}>
          <Line data={chartData()} options={chartOptions()} />
        </div>
      </div>
    </Show>
  );
}

/** Exported helper: the toggle button for the stat cards row */
export function MetricsTrendButton(props: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      class="px-3 py-1.5 border border-theme-border-em rounded-lg bg-theme-surface text-[11px] text-theme-text-secondary hover:text-theme-text-primary hover:border-theme-accent transition-colors cursor-pointer flex items-center gap-1.5"
      onClick={props.onToggle}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      Metrics Trend
      <span class="text-theme-text-tertiary text-[9px]">{props.expanded ? "▲" : "▼"}</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TargetMetricsChart.tsx
git commit -m "feat: add TargetMetricsChart component with session selection"
```

---

## Task 8: Frontend — Redesign SessionAccordionCard

**Files:**
- Modify: `frontend/src/components/SessionAccordionCard.tsx`

This is the largest frontend change. We need to:
1. Remove best/worst frame columns from the unified table
2. Restructure the session summary as an Avg/Min/Max table
3. Add the collapsible session metrics chart

- [ ] **Step 1: Update imports**

At the top of `SessionAccordionCard.tsx`, add:

```typescript
import SessionMetricsChart from "./SessionMetricsChart";
```

- [ ] **Step 2: Remove best/worst frame columns from the table**

Replace the `colgroup` (lines 148-168) with a simplified version that only has session + filters columns:

```tsx
<colgroup>
  {/* Session summary: label, value */}
  <col style={{ width: "100px" }} />
  <col style={{ width: "70px" }} />
  <col style={{ width: "70px" }} />
  <col style={{ width: "70px" }} />
  {/* Filters: name, frames, med hfr, med ecc, exp */}
  <col style={{ width: "28px" }} />
  <col style={{ width: "80px" }} />
  <col style={{ width: "50px" }} />
  <col style={{ width: "50px" }} />
  <col style={{ width: "50px" }} />
</colgroup>
```

Replace the `thead` (lines 169-194) with:

```tsx
<thead>
  <tr class="text-[9px] text-theme-text-tertiary uppercase tracking-wider border-b border-theme-border">
    <th class="text-left px-3 pb-1.5 pt-2.5" colspan={4}>Session Summary</th>
    <th class="text-left px-2 pb-1.5 pt-2.5 border-l border-theme-border" colspan={5}>Filters</th>
  </tr>
  <tr class="text-[9px] text-theme-text-tertiary border-b border-theme-border">
    <th class="px-3 pb-1 text-left"></th>
    <th class="px-2 pb-1 text-right">Avg</th>
    <th class="px-2 pb-1 text-right">Min</th>
    <th class="px-2 pb-1 text-right">Max</th>
    <th class="px-2 pb-1 border-l border-theme-border"></th>
    <th class="px-2 pb-1 text-left">Frames</th>
    <th class="px-2 pb-1 text-right">Med. HFR</th>
    <th class="px-2 pb-1 text-right">Med. Ecc</th>
    <th class="px-2 pb-1 text-right">Exp</th>
  </tr>
</thead>
```

- [ ] **Step 3: Replace table body with Avg/Min/Max summary + filters**

Replace the `tbody` (lines 196-254) with:

```tsx
<tbody>
  {(() => {
    const metrics = [
      {
        label: "HFR", color: "text-metric-hfr",
        avg: detail().median_hfr?.toFixed(2) ?? "—",
        min: detail().min_hfr?.toFixed(1) ?? "—",
        max: detail().max_hfr?.toFixed(1) ?? "—",
      },
      {
        label: "Eccentricity", color: "text-metric-eccentricity",
        avg: detail().median_eccentricity?.toFixed(2) ?? "—",
        min: detail().min_eccentricity?.toFixed(2) ?? "—",
        max: detail().max_eccentricity?.toFixed(2) ?? "—",
      },
      {
        label: "FWHM", color: "text-metric-fwhm",
        avg: detail().median_fwhm?.toFixed(1) ?? "—",
        min: detail().min_fwhm?.toFixed(1) ?? "—",
        max: detail().max_fwhm?.toFixed(1) ?? "—",
      },
      {
        label: "Sensor Temp", color: "text-metric-temp",
        avg: detail().sensor_temp !== null ? `${detail().sensor_temp?.toFixed(0)}°C` : "—",
        min: detail().sensor_temp_min !== null ? `${detail().sensor_temp_min?.toFixed(0)}°` : "—",
        max: detail().sensor_temp_max !== null ? `${detail().sensor_temp_max?.toFixed(0)}°` : "—",
      },
      {
        label: "Guide RMS", color: "text-metric-guiding",
        avg: detail().median_guiding_rms !== null ? `${detail().median_guiding_rms?.toFixed(2)}"` : "—",
        min: detail().min_guiding_rms !== null ? `${detail().min_guiding_rms?.toFixed(2)}"` : "—",
        max: detail().max_guiding_rms !== null ? `${detail().max_guiding_rms?.toFixed(2)}"` : "—",
      },
    ];
    const filters = detail().filter_details;
    const maxRows = Math.max(metrics.length, filters.length);
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
      const m = metrics[i];
      const f = filters[i];
      rows.push(
        <tr class="border-b border-theme-border">
          {m ? (
            <>
              <td class="py-1.5 px-3 text-theme-text-secondary">{m.label}</td>
              <td class={`py-1.5 px-2 text-right font-bold ${m.color}`}>{m.avg}</td>
              <td class="py-1.5 px-2 text-right text-theme-text-tertiary text-[10px]">{m.min}</td>
              <td class="py-1.5 px-2 text-right text-theme-text-tertiary text-[10px]">{m.max}</td>
            </>
          ) : (
            <>
              <td class="py-1.5 px-3"></td>
              <td class="py-1.5 px-2"></td>
              <td class="py-1.5 px-2"></td>
              <td class="py-1.5 px-2"></td>
            </>
          )}
          {f ? (
            <>
              <td class="py-1.5 px-2 font-bold text-theme-text-primary border-l border-theme-border">{f.filter_name}</td>
              <td class="py-1.5 px-2 text-theme-text-secondary">{f.frame_count} · {formatHours(f.integration_seconds)}</td>
              <td class="py-1.5 px-2 text-right text-metric-hfr">{f.median_hfr?.toFixed(1) ?? "—"}</td>
              <td class="py-1.5 px-2 text-right text-metric-eccentricity">{f.median_eccentricity?.toFixed(2) ?? "—"}</td>
              <td class="py-1.5 px-2 text-right text-theme-text-secondary">{f.exposure_time ?? "—"}s</td>
            </>
          ) : (
            <td class="py-1.5 border-l border-theme-border" colspan={5}></td>
          )}
        </tr>
      );
    }
    return rows;
  })()}
</tbody>
```

- [ ] **Step 4: Add single-value metrics below the table**

After the closing `</table></div>` and before the Session Insights section, add:

```tsx
{/* Single-value metrics */}
<div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
  <span>
    <span class="text-theme-text-tertiary">Integration:</span>{" "}
    <span class="font-bold text-metric-integration">{formatHours(detail().integration_seconds)}</span>
  </span>
  <span>
    <span class="text-theme-text-tertiary">Frames:</span>{" "}
    <span class="font-bold text-metric-frames">{detail().frame_count}</span>
  </span>
  <span>
    <span class="text-theme-text-tertiary">Gain / Exp:</span>{" "}
    <span class="font-bold text-metric-gain">
      {detail().gain !== null ? detail().gain : "—"} / {detail().exposure_time !== null ? detail().exposure_time + "s" : "—"}
    </span>
  </span>
  <span>
    <span class="text-theme-text-tertiary">Time:</span>{" "}
    <span class="font-bold text-metric-time">
      {detail().first_frame_time ? `${formatTime(detail().first_frame_time!)} → ${detail().last_frame_time ? formatTime(detail().last_frame_time!) : ""}` : "—"}
    </span>
  </span>
</div>
```

- [ ] **Step 5: Add session metrics chart**

Between the single-value metrics and Session Insights, add:

```tsx
{/* Session Metrics Chart */}
<SessionMetricsChart detail={detail()} />
```

- [ ] **Step 6: Verify build and test visually**

Run: `cd frontend && npm run build`
Expected: Build succeeds. Start the dev server and check the session detail renders correctly.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SessionAccordionCard.tsx
git commit -m "feat: redesign session detail with Avg/Min/Max table and metrics chart"
```

---

## Task 9: Frontend — Add Target Chart and Session Checkboxes to TargetDetailPage

**Files:**
- Modify: `frontend/src/pages/TargetDetailPage.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `TargetDetailPage.tsx`, add:

```typescript
import TargetMetricsChart, { MetricsTrendButton } from "../components/TargetMetricsChart";
import { useSettingsContext } from "../components/SettingsProvider";
```

Inside the component, after the existing state declarations (around line 32), add:

```typescript
const { graphSettings, saveGraphSettings } = useSettingsContext();
const [targetChartExpanded, setTargetChartExpanded] = createSignal(graphSettings().target_chart_expanded);
const [selectedChartDates, setSelectedChartDates] = createSignal<Set<string>>(new Set());

// Initialize selected dates when target detail loads
createEffect(() => {
  const detail = targetDetail();
  if (detail) {
    setSelectedChartDates(new Set(detail.sessions.map((s) => s.session_date)));
  }
});

const toggleTargetChart = () => {
  const next = !targetChartExpanded();
  setTargetChartExpanded(next);
  saveGraphSettings({ target_chart_expanded: next });
};

const toggleChartDate = (date: string) => {
  setSelectedChartDates((prev) => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    return next;
  });
};

const selectAllDates = () => {
  const detail = targetDetail();
  if (detail) {
    setSelectedChartDates(new Set(detail.sessions.map((s) => s.session_date)));
  }
};

const selectNoDates = () => {
  setSelectedChartDates(new Set());
};
```

Add the `createEffect` import if not already present.

- [ ] **Step 2: Add "Metrics Trend" button to stat cards row**

In the stat cards section (around line 121), find the flex container that holds all the stat cards. After the filter badges card (the last card), add the `MetricsTrendButton`:

```tsx
<MetricsTrendButton expanded={targetChartExpanded()} onToggle={toggleTargetChart} />
```

The stat cards container should have `items-center` in its class so the button aligns vertically with the cards.

- [ ] **Step 3: Add TargetMetricsChart below stat cards**

After the stat cards container div closes and before the session table header, add:

```tsx
<Show when={targetDetail()}>
  <TargetMetricsChart
    sessions={targetDetail()!.sessions}
    selectedDates={selectedChartDates()}
    onToggleDate={toggleChartDate}
    onSelectAll={selectAllDates}
    onSelectNone={selectNoDates}
  />
</Show>
```

- [ ] **Step 4: Add session checkboxes**

In the session row rendering (around line 208), add a checkbox column when the target chart is expanded. Before the date column in the table header and row:

In the table header row (around line 184), add as the first `th`:

```tsx
<Show when={targetChartExpanded()}>
  <th class="w-8 px-2"></th>
</Show>
```

In the `SessionAccordionCard` rendering area (around line 208-225), wrap each session in a container that includes the checkbox:

```tsx
<For each={targetDetail()!.sessions}>
  {(session) => (
    <div class="flex items-start">
      <Show when={targetChartExpanded()}>
        <div class="flex items-center pt-2.5 px-2">
          <input
            type="checkbox"
            checked={selectedChartDates().has(session.session_date)}
            onChange={() => toggleChartDate(session.session_date)}
            class="w-3.5 h-3.5 rounded border-theme-border accent-theme-accent cursor-pointer"
          />
        </div>
      </Show>
      <div class="flex-1">
        <SessionAccordionCard
          session={session}
          isExpanded={expandedSessions().has(session.session_date)}
          onToggle={() => toggleSession(session.session_date)}
          detail={sessionCache()[session.session_date] ?? null}
          autoScroll
          visibleColumns={{
            hfr: visible("quality", "hfr"),
            eccentricity: visible("quality", "eccentricity"),
            fwhm: visible("quality", "fwhm"),
            detected_stars: visible("quality", "detected_stars"),
            guiding_rms: visible("guiding", "rms_total"),
          }}
        />
      </div>
    </div>
  )}
</For>
```

Note: This replaces the existing `<For>` that renders `SessionAccordionCard` directly. The checkbox wrapper adds the selection UI only when the target chart is expanded.

- [ ] **Step 5: Verify build and test visually**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

Run: `cd frontend && npm run dev`
Test: Open a target detail page, verify "Metrics Trend" button appears, clicking it shows the chart, and session checkboxes appear.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TargetDetailPage.tsx
git commit -m "feat: add target metrics chart with session selection checkboxes"
```

---

## Task 10: Integration Testing and Polish

**Files:**
- Various — fix any issues found during integration testing

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: All tests pass. Fix any failures related to schema changes (especially tests referencing `best_frame`/`worst_frame`).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Deploy and test end-to-end**

Follow the deploy workflow: push dev, pull on remote, rebuild.

Test checklist:
- Expand a session → summary table shows Avg/Min/Max
- No best/worst frame columns visible
- Filters table shows "Med. HFR" and "Med. Ecc" headers
- Session metrics chart expands/collapses
- Metric pills toggle lines on/off
- Filter pills show per-filter overlay
- Target "Metrics Trend" button works
- Target chart shows cross-session data
- Session checkboxes appear when target chart is expanded
- Select All / None works
- Graph settings persist across page refreshes
- Theme changes update chart colors

- [ ] **Step 4: Fix any issues found**

Address any visual, functional, or data issues discovered during testing.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes for session detail redesign"
```
