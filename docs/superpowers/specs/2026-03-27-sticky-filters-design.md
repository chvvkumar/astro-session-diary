# Sticky Filters & Settings Persistence

## Problem

Dashboard filters (search, camera, telescope, optical filters, date range, FITS queries) reset to defaults when the user navigates away and returns. The scan frame filter ("All frames" vs "Light frames only") also resets to "All frames" on every mount, ignoring what was used in the last scan.

## Approach

Two independent persistence mechanisms:

1. **Dashboard filters** — sessionStorage + URL search params (session-scoped, shareable)
2. **Scan frame filter** — server-persisted in `general` JSONB, saved on scan start

## 1. Dashboard Filter Persistence

### Storage layers

| Layer | Purpose | Lifetime |
|-------|---------|----------|
| URL search params | Shareable links, bookmarks | As long as the URL exists |
| sessionStorage (`dashboard_filters`) | Survive in-app navigation | Tab lifetime |
| `defaultFilters` in catalog.ts | Fallback | Hardcoded |

### Initialization priority (on page load)

1. **URL search params** (highest) — enables shared/bookmarked links
2. **sessionStorage** — restores state after navigating to target detail and back
3. **defaultFilters** — clean slate fallback

If URL params are present, they are parsed into an `ActiveFilters` object and also written to sessionStorage to keep both in sync.

### On filter change

A `createEffect` in `catalog.ts` watches the `filters` signal and:
- Serializes current filters to sessionStorage as JSON under key `"dashboard_filters"`
- Syncs non-default values to URL search params via `useSearchParams` from `@solidjs/router`

### On reset

`resetFilters()` additionally:
- Removes the `dashboard_filters` key from sessionStorage
- Clears all filter-related URL search params

### URL param format

Reuses the existing `buildTargetQuery` param names from `client.ts`:

| Filter | Param | Example |
|--------|-------|---------|
| Search | `search` | `?search=M31` |
| Camera | `camera` | `?camera=ASI2600MM` |
| Telescope | `telescope` | `?telescope=RC8` |
| Optical filters | `filters` | `?filters=Ha,OIII` |
| Date start | `date_from` | `?date_from=2025-01-01` |
| Date end | `date_to` | `?date_to=2025-12-31` |
| FITS queries | `fits_key`, `fits_op`, `fits_val` | repeated per query row |

### Files changed

- **`frontend/src/store/catalog.ts`** — add `createEffect` for persistence, add `initFiltersFromStorage()` that reads URL params then sessionStorage. Export a `parseFiltersFromParams` helper for URL decoding.
- **`frontend/src/pages/DashboardPage.tsx`** — call `initFiltersFromStorage(searchParams)` on mount via `onMount`, passing the current router search params. The function is idempotent (guards against re-init) since `catalog.ts` uses module-level signals.
- **`frontend/src/components/Sidebar.tsx`** — no changes; `resetFilters()` in the store handles cleanup.

## 2. Scan Frame Filter Persistence

### Mechanism

Persist `include_calibration` in the existing `general` JSONB column of `UserSettings`. The value is saved each time a scan starts and read on component mount.

### Backend changes

- **`backend/app/api/scan.py`** — in the POST `/scan` handler, before dispatching the Celery task, write `include_calibration` to the `general` settings:
  ```python
  row.general = {**(row.general or {}), "include_calibration": include_calibration}
  ```
- **`backend/app/worker/tasks.py`** — the auto-scan path (line 105) currently hardcodes `include_calibration=True`. Change it to read from `UserSettings.general.get("include_calibration", True)`.

### Frontend changes

- **`frontend/src/types/index.ts`** — add `include_calibration: boolean` to `GeneralSettings`.
- **`frontend/src/components/ScanManager.tsx`** — read settings from `useSettings()` context on mount. Initialize `frameFilter` signal from `settings.general.include_calibration` (`true` → `"all"`, `false` → `"light_only"`). Default to `"all"` if the field is absent.

### Behavior

- User selects "Light frames only" and clicks "Scan Directory" → backend saves `include_calibration: false` and starts the scan.
- Next visit to the Scan tab → radio reflects "Light frames only".
- If no scan has ever run → defaults to `true` (all frames).

## Edge Cases

- **Multiple FITS queries in URL**: encoded as repeated `fits_key`, `fits_op`, `fits_val` params (same order). On parse, group into triplets by index.
- **Stale sessionStorage**: if the stored JSON doesn't match the `ActiveFilters` shape (e.g., after a code update adds a new filter field), fall back to defaults for missing keys and merge with stored values for known keys.
- **Empty URL params**: treated as "not set" — fall through to sessionStorage.
- **Two tabs**: each tab has independent sessionStorage (that's the browser default for sessionStorage). URL params are per-tab by nature. No conflict.

## Out of Scope

- Persisting dashboard filters server-side (not needed for single-user app).
- Persisting expanded/collapsed target state.
- Deep-linking to specific settings tabs (already works via `?tab=` param).
