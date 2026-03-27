# Sticky Filters & Settings Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard filters survive navigation (via sessionStorage + URL params) and persist the scan frame filter setting on the backend.

**Architecture:** Two independent persistence layers — (1) client-side sessionStorage + URL search params for dashboard filters in `catalog.ts`, (2) server-side `include_calibration` field in the `general` JSONB column for the scan frame filter. URL params take priority over sessionStorage on load; sessionStorage survives in-app navigation.

**Tech Stack:** SolidJS signals/effects, `@solidjs/router` `useSearchParams`, `sessionStorage`, FastAPI/Pydantic, SQLAlchemy JSONB.

---

### Task 1: Add `include_calibration` to backend GeneralSettings schema

**Files:**
- Modify: `backend/app/schemas/settings.py:4-8`

- [ ] **Step 1: Add field to Pydantic model**

In `backend/app/schemas/settings.py`, add `include_calibration` with a default of `True` to the `GeneralSettings` model:

```python
class GeneralSettings(BaseModel):
    auto_scan_enabled: bool = True
    auto_scan_interval: int = 240
    thumbnail_width: int = 800
    default_page_size: int = 50
    include_calibration: bool = True
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd backend && python -m pytest tests/test_api_settings.py -v`
Expected: all existing tests PASS (the new field has a default so existing data is unaffected)

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/settings.py
git commit -m "feat: add include_calibration to GeneralSettings schema"
```

---

### Task 2: Persist `include_calibration` when a scan starts

**Files:**
- Modify: `backend/app/api/scan.py:22-42`

- [ ] **Step 1: Add DB session dependency and persist setting in trigger_scan**

In `backend/app/api/scan.py`, modify the `trigger_scan` endpoint to save `include_calibration` into user settings before dispatching the Celery task:

```python
@router.post("")
async def trigger_scan(
    include_calibration: bool = Query(True, description="Include calibration frames (BIAS, DARK, FLAT)"),
    session: AsyncSession = Depends(get_session),
):
    """Walk the FITS directory, queue new files for ingestion."""
    # Persist the frame filter choice for next visit
    from app.models.user_settings import UserSettings, SETTINGS_ROW_ID
    result = await session.execute(
        select(UserSettings).where(UserSettings.id == SETTINGS_ROW_ID)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = UserSettings(id=SETTINGS_ROW_ID)
        session.add(row)
    row.general = {**(row.general or {}), "include_calibration": include_calibration}
    await session.commit()

    r = get_async_redis()
    try:
        state = await get_scan_state(r)
        if state.state in ("scanning", "ingesting"):
            return {"status": "already_running", **state.to_dict()}

        run_scan.delay(include_calibration=include_calibration)

        return {"status": "accepted", "message": "Scan queued — check /scan/status for progress"}
    finally:
        await r.aclose()
```

Note: The `select` import and `get_session` import are already present at the top of the file.

- [ ] **Step 2: Verify scan endpoint test still passes**

Run: `cd backend && python -m pytest tests/test_api_scan.py -v`
Expected: PASS (test mocks the session)

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/scan.py
git commit -m "feat: persist include_calibration to settings on scan start"
```

---

### Task 3: Auto-scan reads stored `include_calibration`

**Files:**
- Modify: `backend/app/worker/tasks.py:72-105`

- [ ] **Step 1: Update auto_scan_tick to read include_calibration from settings**

In `backend/app/worker/tasks.py`, in the `auto_scan_tick` function, change line 105 from:

```python
    run_scan.delay(include_calibration=True)
```

to:

```python
    include_cal = (row.general or {}).get("include_calibration", True)
    run_scan.delay(include_calibration=include_cal)
```

The `row` variable is already available from the settings read on line 79-81.

- [ ] **Step 2: Commit**

```bash
git add backend/app/worker/tasks.py
git commit -m "feat: auto-scan uses stored include_calibration preference"
```

---

### Task 4: Frontend reads `include_calibration` from settings

**Files:**
- Modify: `frontend/src/types/index.ts:216-221`
- Modify: `frontend/src/components/ScanManager.tsx:1-9`

- [ ] **Step 1: Add field to TypeScript type**

In `frontend/src/types/index.ts`, add `include_calibration` to `GeneralSettings`:

```typescript
export interface GeneralSettings {
  auto_scan_enabled: boolean;
  auto_scan_interval: number;
  thumbnail_width: number;
  default_page_size: number;
  include_calibration: boolean;
}
```

- [ ] **Step 2: Initialize ScanManager frameFilter from settings**

In `frontend/src/components/ScanManager.tsx`, import `useSettingsContext` and initialize `frameFilter` from settings:

Replace lines 1-9:

```typescript
import { Component, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { useScan } from "../store/scan";
import { useSettingsContext } from "./SettingsProvider";

type FrameFilter = "all" | "light_only";

const ScanManager: Component = () => {
  const { scanStatus, scanError, isActive, startScan, startRegeneration, resetScan, stopPolling } = useScan();
  const { settings } = useSettingsContext();
  const [expanded, setExpanded] = createSignal(false);
  const [frameFilter, setFrameFilter] = createSignal<FrameFilter>("all");

  // Sync frameFilter from server settings once loaded
  createEffect(() => {
    const s = settings();
    if (s) {
      setFrameFilter(s.general.include_calibration ? "all" : "light_only");
    }
  });
```

- [ ] **Step 3: Verify the app builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/components/ScanManager.tsx
git commit -m "feat: ScanManager reads include_calibration from server settings"
```

---

### Task 5: Dashboard filter persistence — sessionStorage + URL sync

**Files:**
- Modify: `frontend/src/store/catalog.ts`
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add persistence helpers and createEffect to catalog.ts**

Replace the entire contents of `frontend/src/store/catalog.ts` with:

```typescript
import { createSignal, createResource, createEffect } from "solid-js";
import { api } from "../api/client";
import type { ActiveFilters, TargetAggregationResponse, EquipmentList } from "../types";

const STORAGE_KEY = "dashboard_filters";

const defaultFilters: ActiveFilters = {
  searchQuery: "",
  camera: null,
  telescope: null,
  opticalFilters: [],
  dateRange: { start: null, end: null },
  fitsQueries: [],
};

// ---------------------------------------------------------------------------
// URL param serialization (reuses buildTargetQuery param names)
// ---------------------------------------------------------------------------

function filtersToParams(f: ActiveFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.searchQuery) p.search = f.searchQuery;
  if (f.camera) p.camera = f.camera;
  if (f.telescope) p.telescope = f.telescope;
  if (f.opticalFilters.length > 0) p.filters = f.opticalFilters.join(",");
  if (f.dateRange.start) p.date_from = f.dateRange.start;
  if (f.dateRange.end) p.date_to = f.dateRange.end;
  if (f.fitsQueries.length > 0) {
    p.fits_key = f.fitsQueries.map((q) => q.key).join(",");
    p.fits_op = f.fitsQueries.map((q) => q.operator).join(",");
    p.fits_val = f.fitsQueries.map((q) => q.value).join(",");
  }
  return p;
}

function paramsToFilters(params: URLSearchParams): ActiveFilters | null {
  // Return null if no filter params are present
  const keys = ["search", "camera", "telescope", "filters", "date_from", "date_to", "fits_key"];
  if (!keys.some((k) => params.has(k))) return null;

  const fitsKeys = params.get("fits_key")?.split(",") ?? [];
  const fitsOps = params.get("fits_op")?.split(",") ?? [];
  const fitsVals = params.get("fits_val")?.split(",") ?? [];
  const fitsQueries = fitsKeys.map((key, i) => ({
    key,
    operator: fitsOps[i] ?? "eq",
    value: fitsVals[i] ?? "",
  }));

  return {
    searchQuery: params.get("search") ?? "",
    camera: params.get("camera") || null,
    telescope: params.get("telescope") || null,
    opticalFilters: params.get("filters")?.split(",").filter(Boolean) ?? [],
    dateRange: {
      start: params.get("date_from") || null,
      end: params.get("date_to") || null,
    },
    fitsQueries,
  };
}

function loadFromSession(): ActiveFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Merge with defaults to handle missing keys from stale data
    return { ...defaultFilters, ...parsed };
  } catch {
    return null;
  }
}

function saveToSession(f: ActiveFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const [filters, setFilters] = createSignal<ActiveFilters>({ ...defaultFilters });
const [targetData, { refetch: refetchTargets }] = createResource(filters, (f) => api.getTargets(f));
const [equipment] = createResource(() => api.getEquipment());

const [expandedTargets, setExpandedTargets] = createSignal<Set<string>>(new Set());

// Persist to sessionStorage on every filter change
let initialized = false;
createEffect(() => {
  const f = filters();
  if (initialized) {
    saveToSession(f);
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Call once from DashboardPage onMount with the current URL search params. */
export function initFiltersFromUrl(searchParams: URLSearchParams): void {
  if (initialized) return;
  initialized = true;

  // Priority: URL params > sessionStorage > defaults
  const fromUrl = paramsToFilters(searchParams);
  if (fromUrl) {
    setFilters(fromUrl);
    saveToSession(fromUrl);
    return;
  }

  const fromSession = loadFromSession();
  if (fromSession) {
    setFilters(fromSession);
    return;
  }

  // defaults already set
}

export function useCatalog() {
  return {
    filters,
    setFilters,
    targetData,
    equipment,
    expandedTargets,
    refetchTargets,

    /** Returns current filters as URL-safe key-value pairs for setSearchParams. */
    filtersAsParams: () => filtersToParams(filters()),

    updateFilter: <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },

    toggleOpticalFilter: (f: string) => {
      setFilters((prev) => {
        const current = prev.opticalFilters;
        const next = current.includes(f)
          ? current.filter((x) => x !== f)
          : [...current, f];
        return { ...prev, opticalFilters: next };
      });
    },

    toggleExpanded: (targetId: string) => {
      setExpandedTargets((prev) => {
        const next = new Set(prev);
        if (next.has(targetId)) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
    },

    resetFilters: () => {
      clearSession();
      setFilters({ ...defaultFilters });
    },
  };
}
```

- [ ] **Step 2: Update DashboardPage to init filters from URL and sync params**

Replace `frontend/src/pages/DashboardPage.tsx` with:

```typescript
import { Component, onMount, createEffect } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import Sidebar from "../components/Sidebar";
import TargetFeed from "../components/TargetFeed";
import { initFiltersFromUrl, useCatalog } from "../store/catalog";

const DashboardPage: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { filtersAsParams } = useCatalog();

  // On first mount, restore filters from URL params or sessionStorage
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    initFiltersFromUrl(params);
  });

  // Keep URL params in sync with current filters
  createEffect(() => {
    const p = filtersAsParams();
    // Clear all filter params first, then set current ones
    const clear: Record<string, undefined> = {};
    for (const key of ["search", "camera", "telescope", "filters", "date_from", "date_to", "fits_key", "fits_op", "fits_val"]) {
      clear[key] = undefined;
    }
    setSearchParams({ ...clear, ...p }, { replace: true });
  });

  return (
    <div class="flex">
      <Sidebar />
      <main class="flex-1 min-h-[calc(100vh-57px)]">
        <TargetFeed />
      </main>
    </div>
  );
};

export default DashboardPage;
```

- [ ] **Step 3: Verify the app builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/catalog.ts frontend/src/pages/DashboardPage.tsx
git commit -m "feat: persist dashboard filters via sessionStorage + URL params"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Verify dashboard filter persistence**

1. Open the dashboard, set a search query and select a camera filter
2. Navigate to a target detail page, then press browser back
3. Confirm the search query and camera filter are still applied
4. Copy the URL — it should contain `?search=...&camera=...`
5. Open that URL in a new tab — filters should restore from URL params
6. Close the tab and reopen the dashboard at `/` — filters should be gone (sessionStorage is cleared)

- [ ] **Step 2: Verify reset clears everything**

1. Apply some filters on the dashboard
2. Click "Reset Filters"
3. Confirm URL params are cleared and filters are back to defaults
4. Navigate away and back — filters should still be defaults

- [ ] **Step 3: Verify scan frame filter persistence**

1. Go to Settings > Scan & Ingest tab
2. Select "Light frames only"
3. Click "Scan Directory"
4. Navigate to the dashboard and back to Settings > Scan & Ingest
5. Confirm "Light frames only" is still selected

- [ ] **Step 4: Commit any fixes if needed**

---
