# Search Improvements Design

**Date:** 2026-03-27
**Scope:** Four features to improve collection sifting: fuzzy search, object type filtering, session-level HFR quality filters, and duplicate target detection with merge management.

---

## Feature 1: Fuzzy / Trigram Search with Alias Matching

### Problem

The current search uses PostgreSQL `ILIKE` with `%query%` patterns. This means:
- Typos like "Horshead" for "Horsehead Nebula" return nothing
- Alias matching on the `targets.aliases` array uses exact uppercase comparison (`Target.aliases.any(func.upper(q))`)
- Cross-catalog name matching only works if the user types the exact stored alias

### Backend

- **Migration:** Enable `pg_trgm` extension (`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
- **Index:** Add GIN trigram index on `targets.primary_name`: `CREATE INDEX ix_targets_primary_name_trgm ON targets USING gin (primary_name gin_trgm_ops)`
- **Autocomplete endpoint** (`GET /targets/search`):
  - Replace pure `ILIKE` with a two-tier strategy:
    1. **Fast path:** Exact substring matches via `ILIKE` — ranked first
    2. **Fuzzy path:** Trigram `similarity()` against `primary_name` and against each element in `aliases` array — ranked by similarity score
  - Minimum similarity threshold: **0.15** (low enough for typos, high enough to filter noise)
  - Return a `match_source` field: `"primary_name"` or the specific alias string that matched
  - Return `similarity_score` for ordering
- **Updated response schema** (`TargetSearchResult`):
  - Add `match_source: str | None` — the alias that matched (null if primary_name matched)
  - Add `similarity_score: float` — for frontend ranking
  - Add `aliases: list[str]` — all known designations for the target
- **Main list endpoint** (`GET /targets`):
  - The `search` param also uses trigram matching (not just `ILIKE`) so dashboard filtering is fuzzy too
  - Unresolved `obj:` names are also compared with trigram similarity against the search query

### Frontend

- **Autocomplete dropdown** (`SearchBar.tsx`):
  - When match came from an alias, show it: **IC 434** _(matched: Horsehead Nebula)_
  - Results ordered by similarity score (exact matches first, then fuzzy)
- **No other UI changes** — fuzzy matching is transparent to the user; they just type and get better results

### Implementation Notes

- `pg_trgm` is a contrib extension, available by default in PostgreSQL but needs `CREATE EXTENSION`
- Trigram index on `primary_name` handles the common case; alias matching requires unnesting the array in the query (`unnest(aliases)` joined with similarity)
- The existing GIN index on `aliases` is for exact `@>` / `.any()` lookups and does not help trigram queries — the unnest approach handles this without a second index

---

## Feature 2: Object Type Filtering

### Problem

The `Target` table stores `object_type` from SIMBAD (e.g., "Galaxy", "EmissionNebula", "HII", "OpenCluster") but there is no way to filter by it in the UI. When sifting a collection, users often think categorically: "show me my galaxies."

### Backend

- **New endpoint** `GET /targets/object-types`:
  - Returns distinct `object_type` values from resolved targets with per-type target counts
  - Response: `list[ObjectTypeCount]` where `ObjectTypeCount = { object_type: str, count: int }`
  - Only counts targets with non-null `object_type`
  - Counts respect other active filters (camera, telescope, date range, etc.) so the numbers reflect the current filtered view
- **Updated `GET /targets`**:
  - New query param: `object_type: str | None` (comma-separated list of types)
  - Filters resolved targets by matching `Target.object_type` against the provided list
  - Unresolved targets (no `object_type`) are included only when no object type filter is active, or when the special value `"Unresolved"` is in the list

### Frontend

- **New `ObjectTypeToggles` component** in sidebar, between SearchBar and DateRangePicker
- Same toggle pill UX as `FilterToggles` — multi-select, click to toggle on/off
- Each pill shows type name + count badge: `Galaxy (12)`
- Counts update reactively when other filters change (fetched from `/targets/object-types` with current filter params forwarded)
- An **"Unresolved"** pill is always shown if unresolved targets exist, so they aren't silently hidden
- **Store changes:** Add `objectTypes: string[]` to `ActiveFilters` in `catalog.ts`, persisted to sessionStorage and URL params (`object_type` param)

### Schema

```python
class ObjectTypeCount(BaseModel):
    object_type: str
    count: int
```

---

## Feature 3: Session-Level HFR Quality Filters

### Problem

Quality metrics (HFR) are computed and stored per frame and aggregated per session, but there is no way to filter targets or sessions by quality. Users want to answer: "show me sessions with good seeing" or "find sessions where HFR was above 3."

### Backend

- **Updated `GET /targets`**:
  - New query params: `hfr_min: float | None`, `hfr_max: float | None`
  - Filtering happens at the **session level**: a session's median HFR must fall within the specified range for that session to be included
  - If all sessions of a target are filtered out, the target is excluded from results
  - Response changes: each `TargetAggregation` gains `matched_sessions: int` and `total_sessions: int` fields so the UI can show partial matches

### Frontend

- **New `QualityFilters` component** in sidebar, after HardwareSelects
- Single min/max range input pair for **HFR**:
  - Two small number inputs (min / max), step 0.1
  - Placeholder text or subtle label showing the range of HFR values in the current data (e.g., "Range: 0.8 – 4.2")
  - Leave blank = no filter on that bound
- **Store changes:** Add `qualityFilters: { hfrMin?: number, hfrMax?: number }` to `ActiveFilters`, persisted to sessionStorage and URL params (`hfr_min`, `hfr_max`)
- **Target rows:** When quality filters are active and a target has partial session matches, show "N of M sessions" indicator

### Schema Changes

```python
class TargetAggregation(BaseModel):
    # ... existing fields ...
    matched_sessions: int   # sessions passing quality filter
    total_sessions: int     # total sessions for this target
```

---

## Feature 4: Duplicate / Unmerged Target Detection & Merge Management

### Problem

The same astronomical object can appear as separate entries when N.I.N.A. logs it under different OBJECT names across sessions (e.g., "NGC 7000" vs "North America Nebula"). If SIMBAD resolves both, the alias system merges them. But if one fails resolution, you get a resolved target AND a separate unresolved `obj:` entry for the same physical object.

### Detection

- **New Celery task** `detect_duplicate_targets`:
  - Triggered on demand via API or automatically after a scan completes
  - For each unresolved `obj:` name (images with `resolved_target_id = NULL` and a non-null OBJECT header):
    1. Re-attempt SIMBAD lookup (skip names in the negative cache)
    2. If SIMBAD resolves to a target already in the DB → confirmed duplicate
    3. If no SIMBAD match, compare the name against all resolved target aliases using trigram similarity
    4. If similarity > **0.4** → candidate duplicate
  - Stores results in a `merge_candidates` table

- **New table** `merge_candidates`:
  ```
  id: UUID (PK)
  source_name: str           -- the unresolved obj: name
  source_image_count: int    -- how many images are affected
  suggested_target_id: UUID  -- FK to targets.id
  similarity_score: float    -- trigram score or 1.0 for SIMBAD-confirmed
  method: str                -- "simbad" or "trigram"
  status: str                -- "pending", "accepted", "dismissed"
  created_at: datetime
  resolved_at: datetime | None
  ```

### Merge Action

- **New endpoint** `POST /targets/merge`:
  - Body: `{ winner_id: UUID, loser_id: UUID }` (loser can be a resolved target UUID or an unresolved obj: name identifier)
  - Actions:
    1. Reassign all images from loser to winner (`resolved_target_id = winner.id`)
    2. Add loser's name + aliases to winner's `aliases` array (deduped)
    3. Soft-delete the loser: set new columns `merged_into_id: UUID (FK targets.id)` and `merged_at: datetime`
    4. Update any related `merge_candidates` rows to `status = "accepted"`
  - Soft-deleted targets are excluded from all normal queries (search, list, aggregation)

- **For unresolved obj: names** (no target record):
  - Merge creates the alias link on the winner and bulk-updates `resolved_target_id` on affected images
  - No target record to soft-delete; the merge_candidate row tracks this
  - Unmerge for these: removes the alias from the winner, sets `resolved_target_id = NULL` on affected images (restoring them to unresolved state), and resets the merge_candidate to `"pending"`

### Unmerge Action

- **New endpoint** `POST /targets/{id}/unmerge`:
  - Restores the soft-deleted target: clears `merged_into_id` and `merged_at`
  - Removes aliases that were added during the merge from the winner
  - Reassigns images back to the restored target based on their `raw_headers["OBJECT"]` value matching the restored target's aliases
  - Updates merge_candidate status back to `"pending"`

### Schema Changes

**Target model additions:**
```python
merged_into_id: UUID | None   # FK to targets.id, null = active
merged_at: datetime | None     # when the merge happened
```

### Merge Management UI (Settings Page)

New section in settings alongside existing filter aliases and equipment alias management:

- **"Target Merges" section** with two tabs/views:
  1. **Suggestions** — list of pending merge candidates:
     - Shows: unresolved name, suggested match, similarity score, method (SIMBAD/fuzzy), affected image count
     - Actions: "Merge" button, "Dismiss" button
     - Dismissed candidates don't reappear (status = "dismissed")
  2. **Merged Targets** — list of completed merges:
     - Shows: winner name ← loser name, image count moved, merge date
     - Action: "Unmerge" button

### Dashboard Integration

- After a scan completes, if `detect_duplicate_targets` finds new candidates, show a notification badge on the settings icon (e.g., "3 possible duplicates")
- The badge count comes from a lightweight `GET /targets/merge-candidates/count` endpoint (only pending status)

---

## Cross-Cutting Concerns

### Filter Persistence

All new filters (`objectTypes`, `qualityFilters.hfrMin`, `qualityFilters.hfrMax`) follow the existing pattern:
- Serialized to URL params for shareable links
- Persisted to sessionStorage for tab persistence
- Restored with priority: URL params > sessionStorage > defaults

### URL Param Names

| Filter | Param |
|--------|-------|
| Object types | `object_type=Galaxy,EmissionNebula` |
| HFR min | `hfr_min=1.0` |
| HFR max | `hfr_max=3.0` |

### Migration Plan

- Single Alembic migration for: `pg_trgm` extension, trigram index on `primary_name`, new columns on `targets` (`merged_into_id`, `merged_at`), new `merge_candidates` table
- No data migration needed — all new fields are nullable/optional

### Sidebar Layout (top to bottom)

1. SearchBar (existing, now with fuzzy results)
2. **ObjectTypeToggles** (new)
3. DateRangePicker (existing)
4. FilterToggles (existing)
5. HardwareSelects (existing)
6. **QualityFilters** (new)
7. FitsQueryBuilder (existing)
8. Reset Filters (existing)
