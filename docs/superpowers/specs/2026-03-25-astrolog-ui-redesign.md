# AstroLog UI Redesign — Design Specification

> **Status:** Approved
> **Date:** 2026-03-25
> **Scope:** Full frontend replacement + backend API evolution + database migration

---

## 1. Overview

Replace the current gallery-centric image browser with a **data-first target aggregation dashboard**. The UI acts as an automated logbook for astrophotography sessions, de-emphasizing thumbnails in favor of deep telemetry aggregation, structured queries, and equipment performance tracking.

The application becomes a two-page SPA:
- **`/` — Dashboard:** Sidebar filter panel + target feed with session drill-down + detail drawer
- **`/admin` — Admin & Stats:** Scan management + full database analytics grid

---

## 2. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Sidebar Filter + Feed | Persistent filters always accessible; main content area for target cards |
| Filter distribution | Colored pill badges | `Ha·13.6h` style — shows actual hours, more readable than stacked bar |
| Sessions | Query-time groupings | `GROUP BY DATE(capture_date), resolved_target_id` — groupings change with active filters |
| API strategy | Evolve existing endpoints | Extend `/api/targets`, add session detail — no parallel route sets |
| Quality metrics | Dedicated columns | `median_hfr`, `eccentricity` on images table for fast queries |
| Filter reactivity | Immediate application | No "Apply" button; FITS query rows apply on Enter |
| Routing | `@solidjs/router` | Proper URL routing: `/` and `/admin`, bookmarkable |
| Scan management | Dedicated `/admin` page | Combined with full database analytics dashboard |

---

## 3. Frontend Architecture

### 3.1 Component Tree

```
App.tsx (router root)
├── NavBar.tsx (top bar: logo, route links)
│
├── Route: / — DashboardPage.tsx
│   ├── Sidebar.tsx (persistent left panel)
│   │   ├── SearchBar.tsx (fuzzy match on target name/aliases, debounced 300ms)
│   │   ├── DateRangePicker.tsx (start/end date inputs)
│   │   ├── FilterToggles.tsx (optical filter pill toggles)
│   │   │   ├── Broadband group: L, R, G, B
│   │   │   └── Narrowband group: Ha, OIII, SII
│   │   ├── HardwareSelects.tsx (camera + telescope dropdowns)
│   │   └── FitsQueryBuilder.tsx (dynamic key-operator-value rows)
│   ├── CommandBar.tsx (sticky top of main content area)
│   │   └── AggregateWidgets.tsx (total time, targets, frames, disk usage)
│   ├── TargetFeed.tsx (scrollable main content)
│   │   └── TargetCard.tsx (one per target)
│   │       ├── FilterBadges.tsx (colored pills per optical filter)
│   │       └── SessionTable.tsx (accordion, rows per date)
│   └── DetailDrawer.tsx (slide-over from right)
│       ├── ReferenceThumbnail.tsx (single stretched JPEG)
│       ├── QualityMetrics.tsx (HFR, eccentricity, exposure stats)
│       └── RawHeaderAccordion.tsx (full FITS header JSON dump)
│
├── Route: /admin — AdminPage.tsx
│   ├── ScanManager.tsx (trigger button, progress bar, status)
│   ├── DatabaseOverview.tsx (4 summary widgets)
│   ├── EquipmentInventory.tsx (cameras + telescopes with frame counts)
│   ├── FilterUsageChart.tsx (global time per optical filter)
│   ├── ImagingTimeline.tsx (monthly integration hours bar chart)
│   ├── TopTargets.tsx (ranked by total integration time)
│   ├── DataQuality.tsx (HFR/eccentricity averages + distribution)
│   ├── StorageBreakdown.tsx (FITS, thumbnails, DB sizes)
│   └── IngestHistory.tsx (log of past scans with counts)
```

### 3.2 State Management

**Global Store (`createStore`):**
```typescript
interface AppState {
  targets: TargetAggregation[];
  activeFilters: {
    searchQuery: string;
    camera: string | null;
    telescope: string | null;
    opticalFilters: string[];      // e.g. ["Ha", "OIII"]
    dateRange: { start: string | null; end: string | null };
    fitsQueries: { key: string; operator: string; value: string }[];
  };
  aggregates: {
    totalIntegrationSeconds: number;
    targetCount: number;
    totalFrames: number;
    diskUsageBytes: number;
  };
}
```

**Local Signals (`createSignal`):**
- `expandedTargets: Set<string>` — target IDs with open session accordions
- `isDrawerOpen: boolean`
- `drawerContext: { targetId: string; date: string } | null`

**Data flow:**
1. Any filter change → updates `activeFilters` in store → triggers `GET /api/targets` with filter params
2. Response populates `targets[]` and `aggregates` reactively
3. Click target card → toggle in `expandedTargets` set → accordion shows sessions (data already in response)
4. Click "Deep Dive" on session row → set `drawerContext` → drawer opens → fetches `GET /api/targets/{id}/sessions/{date}`

### 3.3 Filter Behavior

All filters apply **immediately** on change except FITS query rows (apply on Enter/Add button).

**Optical filter toggles:** OR logic within the group — selecting Ha and OIII means "show targets with frames using Ha OR OIII." Selecting none means no filter (show all).

**Hardware dropdowns:** Populated from `GET /api/targets/equipment`. Single-select. Null means no filter.

**FITS Query Builder:** Dynamic rows with `[key] [operator] [value]`. Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `contains`. AND logic between rows. Add/remove row buttons.

**Search:** Fuzzy match on `primary_name` and `aliases` array. Debounced 300ms.

### 3.4 Color System

Extends existing Tailwind config (`astro-dark: #0a0a1a`, `astro-panel: #12122a`, `astro-accent: #4f7cff`, `astro-muted: #64648a`).

**Optical filter colors (pill badges):**

| Filter | Color | Hex |
|--------|-------|-----|
| Ha | Red | `#c44040` |
| OIII | Teal-blue | `#3a8fd4` |
| SII | Amber | `#d4a43a` |
| L | White/grey | `#e0e0e0` |
| R | Bright red | `#e05050` |
| G | Green | `#50b050` |
| B | Blue | `#5070e0` |

These are standard astrophotography color associations.

### 3.5 Routing

Using `@solidjs/router`. Two routes:

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `DashboardPage` | Sidebar filter + target feed + detail drawer |
| `/admin` | `AdminPage` | Scan management + analytics grid |

NavBar present on both pages with active route indicator.

---

## 4. Backend API Changes

### 4.1 Evolved Endpoints

#### `GET /api/targets` — Target Aggregation (new behavior)

The main data endpoint. Accepts all filter parameters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Fuzzy match on target name/aliases |
| `camera` | string | Exact match on images.camera |
| `telescope` | string | Exact match on images.telescope |
| `filters` | string (comma-separated) | OR match on images.filter_used |
| `date_from` | ISO date | Lower bound on images.capture_date |
| `date_to` | ISO date | Upper bound on images.capture_date |
| `fits_key` | string | JSONB key for custom query (repeatable) |
| `fits_op` | string | Operator: eq, neq, gt, lt, gte, lte, contains (repeatable) |
| `fits_val` | string | Value to compare (repeatable) |

**Response:**
```json
{
  "targets": [
    {
      "target_id": "uuid",
      "primary_name": "M31",
      "aliases": ["Andromeda Galaxy"],
      "total_integration_seconds": 81900,
      "total_frames": 273,
      "filter_distribution": {"Ha": 49140, "OIII": 32760},
      "equipment": ["ASI2600MM", "RC8"],
      "sessions": [
        {
          "session_date": "2023-11-14",
          "integration_seconds": 28500,
          "frame_count": 95,
          "filters_used": ["Ha", "OIII"]
        }
      ]
    }
  ],
  "aggregates": {
    "total_integration_seconds": 152280,
    "target_count": 12,
    "total_frames": 8941,
    "disk_usage_bytes": 1319413953331
  }
}
```

**SQL Strategy:** Filter images with WHERE clauses → GROUP BY `(resolved_target_id, DATE(capture_date))` for sessions → nest sessions under targets → compute aggregates across filtered set. Two queries: one for targets+sessions, one for global aggregates.

#### `GET /api/targets/{target_id}/sessions/{date}` — Session Detail (new)

Heavy data endpoint for the detail drawer. Only called on user interaction.

**Response:**
```json
{
  "target_name": "M31",
  "session_date": "2023-11-14",
  "thumbnail_url": "/thumbnails/m31_ref.jpg",
  "frame_count": 95,
  "integration_seconds": 28500,
  "median_hfr": 2.41,
  "median_eccentricity": 0.32,
  "filters_used": {"Ha": 57, "OIII": 38},
  "equipment": {"camera": "ASI2600MM", "telescope": "RC8"},
  "raw_reference_header": {"EXPTIME": 300, "GAIN": 100, "FOCPOS": 15234}
}
```

Queries images for given target+date, computes medians, grabs first frame's thumbnail and raw header.

#### `GET /api/targets/equipment` — Hardware Dropdowns (new)

**Response:**
```json
{
  "cameras": ["ASI2600MM", "ASI533MC", "QHY268M"],
  "telescopes": ["RC8", "Redcat 51", "WO GT81"]
}
```

Returns distinct non-null values from `images.camera` and `images.telescope`.

#### `GET /api/targets/search` — Unchanged

Existing autocomplete endpoint. Still used by the sidebar search.

### 4.2 Admin Stats Endpoint

#### `GET /api/stats` — Database Analytics (new)

Returns all analytics data for the admin page in a single response.

**Response:**
```json
{
  "overview": {
    "total_integration_seconds": 1524600,
    "target_count": 127,
    "total_frames": 48291,
    "disk_usage_bytes": 2638827906662
  },
  "equipment": {
    "cameras": [{"name": "ASI2600MM", "frame_count": 32410}],
    "telescopes": [{"name": "RC8", "frame_count": 28100}]
  },
  "filter_usage": {"Ha": 512280, "OIII": 353160, "SII": 195120, "L": 259200},
  "timeline": [
    {"month": "2023-01", "integration_seconds": 43200},
    {"month": "2023-02", "integration_seconds": 61200}
  ],
  "top_targets": [
    {"name": "M31", "integration_seconds": 82080},
    {"name": "NGC 7000", "integration_seconds": 66240}
  ],
  "data_quality": {
    "avg_hfr": 2.34,
    "avg_eccentricity": 0.28,
    "best_hfr": 1.82,
    "hfr_distribution": [
      {"bucket": "1.0-1.5", "count": 120},
      {"bucket": "1.5-2.0", "count": 890}
    ]
  },
  "storage": {
    "fits_bytes": 2541591056384,
    "thumbnail_bytes": 888020992,
    "database_bytes": 1288490188
  },
  "ingest_history": [
    {"date": "2024-03-20", "files_added": 142},
    {"date": "2024-03-15", "files_added": 89}
  ]
}
```

### 4.3 Existing Endpoints

`GET /api/images`, `GET /api/images/{id}`, `GET /api/images/filters/available` — **removed as part of this plan** since the new frontend fully replaces the old one. The old image endpoints are dead code once the new target aggregation UI is deployed.

`POST /api/scan`, `GET /api/scan/status` — **unchanged**, used by the admin page's ScanManager component.

---

## 5. Database Migration

### 5.1 New Columns on `images` Table

```sql
ALTER TABLE images ADD COLUMN median_hfr FLOAT;
ALTER TABLE images ADD COLUMN eccentricity FLOAT;
ALTER TABLE images ADD COLUMN telescope VARCHAR(255);
ALTER TABLE images ADD COLUMN camera VARCHAR(255);

CREATE INDEX ix_images_telescope ON images (telescope);
CREATE INDEX ix_images_camera ON images (camera);
```

### 5.2 Ingest Pipeline Changes

In `worker/tasks.py` `ingest_file` task, extract additional fields from FITS headers:

| Column | FITS Header Key | Notes |
|--------|----------------|-------|
| `telescope` | `TELESCOP` | Telescope name string |
| `camera` | `INSTRUME` | Camera/instrument name string |
| `median_hfr` | Try keys in order: `HFR`, `MEANFWHM`, `FWHM` | Leave null if none found. N.I.N.A. typically writes `HFR`. |
| `eccentricity` | Try keys in order: `ECCENTRICITY`, `ELLIPTICITY` | Leave null if none found. |

The existing `camera_gain` field already extracts `GAIN`. The new `camera` field extracts `INSTRUME` (the instrument/camera model name, distinct from gain).

**Fallback strategy:** During ingest, attempt each key in the listed order. If none are present in the FITS header, store `null`. This is acceptable — quality metrics are optional display data, not filtering requirements.

---

## 6. Files Changed

### Frontend (replaced)
- `frontend/src/App.tsx` — Router root, NavBar
- `frontend/src/index.tsx` — Mount with router
- `frontend/src/pages/DashboardPage.tsx` — New
- `frontend/src/pages/AdminPage.tsx` — New
- `frontend/src/components/Sidebar.tsx` — New
- `frontend/src/components/SearchBar.tsx` — Reuse/adapt existing
- `frontend/src/components/DateRangePicker.tsx` — New
- `frontend/src/components/FilterToggles.tsx` — New
- `frontend/src/components/HardwareSelects.tsx` — New
- `frontend/src/components/FitsQueryBuilder.tsx` — Reuse/adapt existing FilterPanel
- `frontend/src/components/CommandBar.tsx` — New
- `frontend/src/components/AggregateWidgets.tsx` — New
- `frontend/src/components/TargetFeed.tsx` — New
- `frontend/src/components/TargetCard.tsx` — New
- `frontend/src/components/FilterBadges.tsx` — New
- `frontend/src/components/SessionTable.tsx` — New
- `frontend/src/components/DetailDrawer.tsx` — New (replaces ImageDetail)
- `frontend/src/components/ReferenceThumbnail.tsx` — New
- `frontend/src/components/QualityMetrics.tsx` — New
- `frontend/src/components/RawHeaderAccordion.tsx` — Reuse/adapt HeaderTable
- `frontend/src/components/NavBar.tsx` — New
- `frontend/src/components/ScanManager.tsx` — Reuse/adapt ScanDashboard
- `frontend/src/components/DatabaseOverview.tsx` — New
- `frontend/src/components/EquipmentInventory.tsx` — New
- `frontend/src/components/FilterUsageChart.tsx` — New
- `frontend/src/components/ImagingTimeline.tsx` — New
- `frontend/src/components/TopTargets.tsx` — New
- `frontend/src/components/DataQuality.tsx` — New
- `frontend/src/components/StorageBreakdown.tsx` — New
- `frontend/src/components/IngestHistory.tsx` — New
- `frontend/src/store/catalog.ts` — Rewrite for target aggregation model
- `frontend/src/store/scan.ts` — Reuse as-is
- `frontend/src/store/stats.ts` — New store for admin page
- `frontend/src/api/client.ts` — Extend with new endpoint functions
- `frontend/src/types/index.ts` — Rewrite type definitions
- `frontend/tailwind.config.js` — Add filter color palette
- `frontend/package.json` — Add `@solidjs/router`

### Frontend (removed)
- `frontend/src/components/Gallery.tsx`
- `frontend/src/components/GalleryCard.tsx`
- `frontend/src/components/FilterPanel.tsx`
- `frontend/src/components/ImageDetail.tsx`

### Backend (modified)
- `backend/app/api/targets.py` — Add `GET /api/targets` aggregation endpoint, `GET /api/targets/equipment`, `GET /api/targets/{id}/sessions/{date}`
- `backend/app/schemas/target.py` — Add response schemas for aggregation, session detail, equipment
- `backend/app/models/image.py` — Add `median_hfr`, `eccentricity`, `telescope`, `camera` columns
- `backend/app/schemas/image.py` — Update to include new fields
- `backend/app/worker/tasks.py` — Extract telescope, camera, HFR, eccentricity during ingest
- `backend/app/api/router.py` — Add stats router

### Backend (new)
- `backend/app/api/stats.py` — `GET /api/stats` endpoint
- `backend/app/schemas/stats.py` — Stats response schemas
- `backend/alembic/versions/xxxx_add_quality_and_equipment_columns.py` — Migration

### Backend (removed after frontend deploy)
- `backend/app/api/images.py` — No longer needed
- `backend/app/schemas/image.py` — Can be simplified (internal use only)

---

## 7. New Dependencies

### Frontend
- `@solidjs/router` — client-side routing

### Backend
- None — all functionality achievable with existing stack

---

## 8. Out of Scope

- Real-time WebSocket updates (polling is sufficient for scan status)
- User authentication / multi-user support
- SIMBAD live queries from the UI (resolved during ingest only)
- Export functionality (CSV, PDF reports)
- Mobile-optimized layout (tablet is the minimum target)
- Charting library for admin page (CSS-based bars and simple SVG sufficient for v1; can add Chart.js later if needed)
