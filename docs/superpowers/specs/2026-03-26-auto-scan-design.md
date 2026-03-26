# Auto-Scan Design

## Overview

Periodic automatic scanning of the FITS directory so new files are ingested without manual intervention. Configurable interval and enable/disable toggle in the admin UI.

## Settings

Stored in Redis (survives container restarts, no DB migration needed):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoscan:enabled` | boolean | `false` | Whether auto-scan is active |
| `autoscan:interval` | int (minutes) | `60` | Minutes between scans |
| `autoscan:last_run` | float (timestamp) | `null` | Unix timestamp of last auto-scan start |

Interval choices exposed in UI: **1h, 2h, 4h, 8h, 12h, 24h**

## Backend

### New API endpoints (`/api/scan`)

**`GET /autoscan`**
Returns: `{ "enabled": bool, "interval_minutes": int }`

**`PUT /autoscan`**
Accepts: `{ "enabled": bool, "interval_minutes": int }`
Validates interval is one of [60, 120, 240, 480, 720, 1440].
Updates Redis keys. Returns updated settings.

### Celery heartbeat task

A new periodic task `auto_scan_tick` registered in celery beat with a 60-second interval.

On each tick:
1. Read `autoscan:enabled` from Redis — exit if disabled
2. Read `autoscan:interval` and `autoscan:last_run` from Redis
3. If `now - last_run < interval`, exit (not time yet)
4. Read `scan:state` from Redis — exit if `scanning` or `ingesting` (non-blocking)
5. Set `autoscan:last_run` to now
6. Call `run_scan.delay(include_calibration=True)`

This ensures:
- No overlapping scans (checks state before dispatching)
- Manual scans don't conflict (auto-scan skips if busy)
- Config changes take effect within 60 seconds (no restart needed)
- Negligible overhead (one Redis read per minute when disabled)

### Files to modify

- `backend/app/worker/celery_app.py` — add beat schedule for `auto_scan_tick`
- `backend/app/worker/tasks.py` — add `auto_scan_tick` task
- `backend/app/api/scan.py` — add GET/PUT `/autoscan` endpoints

## Frontend

### ScanManager component changes

Add an "Auto-Scan" section below the existing scan controls:

```
─────────────────────────────
Auto-Scan
  [toggle switch]  Enabled
  Interval: [dropdown: 1h / 2h / 4h / 8h / 12h / 24h]
─────────────────────────────
```

- Toggle calls `PUT /autoscan` with `{ enabled: true/false, interval_minutes: current }`
- Dropdown calls `PUT /autoscan` with `{ enabled: current, interval_minutes: selected }`
- Both update immediately on change (no save button)
- Fetch current settings on mount via `GET /autoscan`

### Files to modify

- `frontend/src/components/ScanManager.tsx` — add auto-scan UI section
- `frontend/src/api/client.ts` — add `getAutoScan()` and `setAutoScan()` methods

## Non-blocking guarantees

1. `auto_scan_tick` checks `scan:state` before dispatching — skips if active
2. `run_scan` sets state to `scanning` atomically — prevents concurrent scans
3. Manual scans set the same state — auto-scan respects them
4. The heartbeat is fire-and-forget — never blocks the beat scheduler
