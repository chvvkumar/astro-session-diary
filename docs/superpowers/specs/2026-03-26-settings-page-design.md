# Settings Page Design

## Overview

A new `/settings` route with a tabbed interface for managing application configuration, filter colors/aliases, and equipment name normalization. Lives alongside the existing Admin page — Admin stays focused on analytics/monitoring, Settings handles configuration.

## Data Model

Single-row `user_settings` table in PostgreSQL:

| Column       | Type      | Purpose                                                    |
|--------------|-----------|------------------------------------------------------------|
| `id`         | UUID (PK) | Fixed single-row ID                                        |
| `general`    | JSONB     | Auto-scan, thumbnail width, default page size              |
| `filters`    | JSONB     | Canonical filter names with colors and aliases              |
| `equipment`  | JSONB     | Canonical camera/telescope names with aliases               |
| `updated_at` | timestamp | Last modification                                          |

### JSONB Structures

**general:**
```json
{
  "auto_scan_enabled": true,
  "auto_scan_interval": 240,
  "thumbnail_width": 800,
  "default_page_size": 50
}
```

**filters:**
```json
{
  "Ha": { "color": "#e74c3c", "aliases": ["ha"] },
  "OIII": { "color": "#3498db", "aliases": ["Oiii", "O"] },
  "SII": { "color": "#f39c12", "aliases": ["Sii", "S"] },
  "L": { "color": "#ffffff", "aliases": [] },
  "R": { "color": "#e74c3c", "aliases": [] },
  "G": { "color": "#2ecc71", "aliases": [] },
  "B": { "color": "#3498db", "aliases": [] },
  "IR": { "color": "#9b59b6", "aliases": ["ir"] }
}
```

**equipment:**
```json
{
  "cameras": {
    "ZWO ASI2600MM Pro": { "aliases": ["ASI2600MM", "ASI2600MM Pro"] }
  },
  "telescopes": {
    "Esprit 100ED": { "aliases": ["Esprit100ED", "SKY-WATCHER Esprit 100"] }
  }
}
```

### Migration

- Alembic migration adds the `user_settings` table. No changes to existing tables.
- Migration seeds one row with default general settings.
- Auto-scan state migrates from Redis keys (`autoscan:enabled`, `autoscan:interval`) into the `general` JSONB on first read. Redis continues to hold ephemeral scan progress/status.

## Backend API

New route group under `/api/settings`.

| Method | Path                              | Purpose                                    |
|--------|-----------------------------------|--------------------------------------------|
| `GET`  | `/settings`                       | Return full settings object                |
| `PUT`  | `/settings/general`               | Update general settings                    |
| `PUT`  | `/settings/filters`               | Update filter config (colors + aliases)    |
| `PUT`  | `/settings/equipment`             | Update equipment config (aliases)          |
| `GET`  | `/settings/suggestions/filters`   | Fuzzy-match duplicate filter names         |
| `GET`  | `/settings/suggestions/equipment` | Fuzzy-match duplicate equipment names      |

### Suggestions Endpoints

Query distinct `filter_used`, `camera`, and `telescope` values from the `images` table, then group by:

1. **Case-insensitive grouping** — catches "Oiii" / "OIII" / "oiii"
2. **Levenshtein distance <= 2** for strings longer than 3 characters — catches "ASI2600MM" / "ASI2600MM Pro" while avoiding false positives on short filter names like "L", "B", "R"

Response includes frame counts per variant so the user can see which name has more data:

```json
{
  "suggestions": [
    {
      "group": ["OIII", "Oiii", "O"],
      "counts": { "OIII": 1204, "Oiii": 312, "O": 47 }
    }
  ]
}
```

### Normalization at Query Time

- API endpoints (`/images`, `/stats`, `/targets`, `/targets/{id}/sessions/{date}`) apply alias-to-canonical mapping before returning data.
- The `images` table stores original FITS header values — normalization is a view layer, not data mutation.
- Raw FITS headers remain untouched and accessible via the RawHeaderAccordion component.

### Deprecation

The existing `/scan/autoscan` GET/PUT endpoints are deprecated in favor of `/settings/general`. They can be kept as thin proxies temporarily for backward compatibility.

## Built-in Filter Defaults

Ships with the app, overridable via settings:

| Filter | Default Color       |
|--------|---------------------|
| Ha     | `#e74c3c` (red)     |
| OIII   | `#3498db` (blue)    |
| SII    | `#f39c12` (gold)    |
| L      | `#ffffff` (white)   |
| R      | `#e74c3c` (red)     |
| G      | `#2ecc71` (green)   |
| B      | `#3498db` (blue)    |
| IR     | `#9b59b6` (purple)  |

Filters not in this map and not configured in settings get a neutral gray.

## Frontend

### Route & Navigation

- New route: `/settings` with tab state in URL query param (`/settings?tab=filters`)
- NavBar gets a Settings link (gear icon or text)

### Settings Store: `useSettings()`

- Fetches settings on mount via `GET /api/settings`
- Provides reactive signals for each tab's data
- Exposes `saveGeneral()`, `saveFilters()`, `saveEquipment()` functions
- Fetches suggestions on demand when Filters/Equipment tabs are opened

### SettingsProvider Context

- Wraps the app at the top level, loaded once at startup
- Chart components read filter colors from this context instead of a hardcoded map
- Lightweight — only the color map and alias maps need to be globally available

### General Tab

- **Auto-scan toggle** + interval dropdown (migrated from Admin page's ScanManager)
- **Thumbnail max width** — number input
- **Default page size** — dropdown (25, 50, 100)
- Save button at bottom

### Filters Tab

- **Suggestions banner** at top: "We found X possible duplicates" with grouped variant names and frame counts. Each group has a "Merge" button — user picks the canonical name, others become aliases.
- **Filter list** below: every canonical filter as a row with:
  - Color swatch + color picker
  - Aliases shown as removable chips/tags
  - Built-in filters come pre-configured with default colors; user can override
- **Add Filter** button for manually defining a new canonical filter with a color
- Save button at bottom

### Equipment Tab

- Same pattern as Filters tab: suggestions banner at top with fuzzy-match merge workflow
- Two sections: **Cameras** and **Telescopes**
- Each canonical equipment entry shows its aliases as removable chips
- No color assignment — just name normalization
- Save button at bottom

### Merge Flow

1. User opens Filters or Equipment tab
2. Frontend calls `GET /api/settings/suggestions/filters` (or `/equipment`)
3. Banner shows grouped suggestions with frame counts
4. User picks canonical name per group, hits Merge
5. Frontend updates local state with new aliases
6. User hits Save → `PUT /api/settings/filters`
7. Suggestions banner refreshes (merged groups disappear)

### Save Flow

1. User edits settings locally (SolidJS signals, no auto-save)
2. Hits Save → `PUT /api/settings/{section}`
3. Backend validates and writes to DB
4. Response returns updated settings, store refreshes
5. Toast notification confirms success
6. Other components reactively pick up new colors/names via shared context

## Scope Exclusions

- No user accounts/multi-user support — single-row global settings
- No theme customization beyond filter colors (existing dark theme stays)
- SIMBAD timeout, MTF stretch parameters, and other rarely-changed values stay as environment variables
- No data mutation — normalization is view-layer only, raw FITS data stays as-is
