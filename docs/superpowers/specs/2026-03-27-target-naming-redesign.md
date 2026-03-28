# Target Naming & SIMBAD Data Storage Redesign

## Problem

Three issues degrade search and display quality:

1. **Double-spaced primary names.** SIMBAD's `%MAIN_ID` uses internal spacing (e.g., `M  31`, `NGC  7000`). These become `primary_name` and break search since nobody types double spaces.

2. **Corrupted aliases.** The `%IDLIST[%*]` script format returns all aliases on a single line. The parser splits by newlines, so hundreds of identifiers collapse into one giant string. 57 of 110 targets are affected.

3. **Catalog codes as display names.** `primary_name` holds SIMBAD's canonical ID (`NGC  7000`) instead of what the user would recognize (`NGC 7000 - North America Nebula`).

## Design

### Data Model Changes

Add two columns to `targets`, redefine `primary_name`:

| Column | Type | Description |
|--------|------|-------------|
| `catalog_id` | `String(100)`, nullable | Best catalog designation via priority hierarchy. E.g., `"NGC 7000"` |
| `common_name` | `String(255)`, nullable | Human-friendly name from SIMBAD `NAME` aliases or FITS OBJECT header. E.g., `"North America Nebula"` |

`primary_name` becomes a constructed display name:
- Both present: `"{catalog_id} - {common_name}"` -> `"NGC 7000 - North America Nebula"`
- Only catalog_id: `"{catalog_id}"` -> `"IC 1318"`
- Only common_name: `"{common_name}"` -> `"Leo Triplet"`

`aliases` becomes a curated list of catalog IDs and common names only (no radio survey cross-references or coordinate-based identifiers).

### Catalog Priority Hierarchy

For selecting `catalog_id` from SIMBAD aliases (first match wins):

| Priority | Catalog | Pattern Example |
|----------|---------|-----------------|
| 1 | Messier | `M 31` |
| 2 | NGC | `NGC 7000` |
| 3 | IC | `IC 1805` |
| 4 | Caldwell | `Caldwell 38` |
| 5 | Sharpless | `SH 2-129` |
| 6 | Abell PN | `PN A66 31` |
| 7 | Arp | `Arp 273` |
| 8 | HCG | `HCG 92` |
| 9 | Barnard | `B 33` |
| 10 | vdB | `vdB 152` |
| 11 | LBN | `LBN 437` |
| 12 | LDN | `LDN 1082` |
| 13 | Collinder | `Cr 399` |
| 14 | Melotte | `Mel 15` |
| 15 | RCW | `RCW 49` |
| 16 | Palomar | `Pal 5` |
| 17 | Trumpler | `Tr 16` |
| 18 | Stock | `Stock 2` |
| 19 | Cederblad | `Ced 214` |
| 20 | Simeis | `Simeis 147` |
| 21 | DWB | `DWB 111` |
| 22 | SNR G | `SNR G180.0-01.7` |
| 23 | Berkeley | `Cl Berkeley 88` |
| 24 | King | `Cl King 7` |
| 25 | Gum | `Gum 12` |

Fallback: SIMBAD main ID with whitespace normalized.

This list is stored as a data structure in code and can be extended by appending entries. No schema changes needed to add catalogs.

### Alias Curation Rules

Keep aliases matching any catalog pattern from the hierarchy above, plus:
- SIMBAD `NAME` entries, title-cased (e.g., `NAME NORTH AMERICA NEBULA` -> `North America Nebula`)
- Original FITS OBJECT header values (normalized via `normalize_object_name`)

Drop everything else: coordinate-based IDs, radio survey cross-references, observatory-specific catalog entries.

### Common Name Extraction

Sources in priority order:
1. SIMBAD `NAME` aliases (e.g., `NAME NORTH AMERICA NEBULA` -> `North America Nebula`)
2. FITS OBJECT header value if it doesn't match any catalog pattern (e.g., `"Andromeda Galaxy"`, `"Great Orion Nebula"`)
3. `NULL` if no common name found

### SIMBAD Alias Parser Fix

Replace the `%IDLIST[%*]` script query with SIMBAD's TAP SQL interface:

```sql
SELECT id FROM ident WHERE oidref = oidref('{object_name}')
```

This returns one alias per row, eliminating the concatenation bug. The main identity query (`%MAIN_ID`, coordinates, object type) can stay on the script interface or also move to TAP.

### Search Changes

**`/targets/search` endpoint (Tier 1 - exact substring):**
Search `primary_name`, `catalog_id`, `common_name`, and `array_to_string(aliases, ' ')` via `ilike`.

**`/targets/search` endpoint (Tier 2 - fuzzy fallback):**
Run `similarity()` against `concat(catalog_id, ' ', common_name)` with threshold 0.3.

**`/targets` aggregation endpoint search filter:**
Same pattern: substring match on `primary_name`, `catalog_id`, `common_name`, aliases, and OBJECT header. Fuzzy match on `concat(catalog_id, ' ', common_name)` at 0.3 threshold.

### Ingest Pipeline Changes

`_resolve_or_cache_target()` in `tasks.py`:
1. Query SIMBAD via TAP for aliases (one row per alias)
2. Filter aliases through curation rules
3. Extract `catalog_id` using priority hierarchy
4. Extract `common_name` from `NAME` aliases or FITS OBJECT header
5. Construct `primary_name` as display name
6. Store all fields with normalized whitespace
7. Alias-based duplicate check uses curated aliases only

### Migration & Backfill

**Alembic migration:**
- Add `catalog_id` (`String(100)`, nullable) and `common_name` (`String(255)`, nullable) columns to `targets`

**Backfill script** (runs once for existing deployments):
For each target:
1. Re-query SIMBAD via TAP to get clean, individual aliases
2. Filter through curation rules
3. Extract `catalog_id` via priority hierarchy
4. Extract `common_name` from `NAME` aliases and existing FITS OBJECT headers linked to this target
5. Construct `primary_name` as `"{catalog_id} - {common_name}"`
6. Update `aliases` with curated list
7. Normalize all whitespace in all fields

**Fresh install:** No backfill needed. Alembic creates columns, and all new targets use the new logic from first ingest.

### Frontend Impact

Minimal. `primary_name` drives display everywhere already. After migration + backfill, it shows `"NGC 7000 - North America Nebula"` instead of `"NGC  7000"`.

Target detail page could optionally display `catalog_id` and `common_name` separately for cleaner layout, but this is cosmetic and not required.

### Files to Modify

| File | Change |
|------|--------|
| `backend/app/models/target.py` | Add `catalog_id`, `common_name` columns |
| `backend/app/services/simbad.py` | TAP query for aliases, alias curation, catalog priority extraction, common name extraction |
| `backend/app/worker/tasks.py` | Update `_resolve_or_cache_target()` to use new fields |
| `backend/app/api/targets.py` | Update search queries to use `catalog_id`, `common_name` |
| `backend/alembic/versions/` | New migration for schema changes |
| `backend/backfill_targets.py` | New or updated backfill script using TAP + curation logic |
