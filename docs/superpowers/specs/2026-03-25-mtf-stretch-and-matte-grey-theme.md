# MTF Thumbnail Stretch & Matte Grey Theme — Design Specification

> **Status:** Approved
> **Date:** 2026-03-25
> **Scope:** Backend thumbnail generation algorithm + global CSS theme palette

---

## 1. Overview

Two changes:

1. **Replace thumbnail stretch algorithm** with N.I.N.A.-equivalent Midtones Transfer Function (MTF), applied after resize for performance.
2. **Switch global color palette** from blue-tinted dark to pure monochromatic matte grey per the AstroLog Matte Grey Theme spec.

---

## 2. Thumbnail Stretch — N.I.N.A. MTF Algorithm

### Problem

Current `ZScaleInterval + AsinhStretch(a=0.1)` produces washed-out thumbnails for deep-sky objects. Linear astro data has most signal clustered at the histogram floor; ZScale's auto-range doesn't adequately separate faint structure from sky background.

### Solution

Implement the exact algorithm N.I.N.A. uses for its preview screen, mathematically equivalent to PixInsight's Auto Screen Transfer Function (STF).

### Algorithm (per channel)

**Step 1 — Resize first.** Read raw FITS float32 data, flip (FITS bottom-up convention), resize to `max_width` maintaining aspect ratio using LANCZOS on the raw linear values. All subsequent steps operate on the resized data.

**Step 2 — Statistical analysis:**
- Compute **median** of the pixel data
- Compute **MAD** (Median Absolute Deviation) = `median(|x - median(x)|)`

**Step 3 — Parameter calculation:**
- Shadows clipping point: `shadows = median - 2.8 * MAD`
  - Clamp to 0 if negative
  - If `shadows >= 1.0`, reset to `0` (guard applied before normalization below)
  - `2.8` is the N.I.N.A. default autostretch factor
- Normalize data: `x = (pixel - shadows) / (1.0 - shadows)`
  - Clamp to [0, 1]
- Compute normalized median: `m_normalized = (median - shadows) / (1.0 - shadows)`
  - This becomes the midtone balance parameter `m`
  - Clamp `m` to `[0.001, 0.999]` to avoid division issues in Step 4

**Step 4 — Apply MTF rational curve:**

```
f(x) = (m - 1) * x / ((2m - 1) * x - m)
```

Where `x` is the normalized pixel value and `m` is the midtone balance. This curve:
- Rapidly boosts dark areas (lifts faint nebula/galaxy signal)
- Compresses highlights (prevents star bloating)
- Maps [0,1] → [0,1]

**Step 5 — Output:** Scale to uint8 (multiply by 255), save as JPEG quality=85.

### Color handling

For color images (3D FITS with shape `[3, H, W]`): **unlinked stretch** — run Steps 2-4 independently per R, G, B channel. This neutralizes Bayer matrix color cast, same as N.I.N.A.'s default behavior.

### Edge cases

- If `MAD == 0` (uniform image): set `m = 0.5` (linear mapping)
- `shadows >= 1.0` and `m` clamping are handled inline in Step 3 (see above)

### Pipeline order change

**Before:** Read → stretch full-res → flip → resize (LANCZOS on uint8) → save
**After:** Read → flip → resize (LANCZOS on raw linear float) → stretch resized → save

No new dependencies required — only `numpy` operations (`np.median` and `np.abs` to compute MAD manually).

---

## 3. Matte Grey Theme

### Problem

Current palette uses blue-tinted dark tones (`#0a0a1a`, `#12122a`) that don't match the desired premium monochromatic aesthetic.

### Solution

Swap the global Tailwind `@theme` CSS variables to pure grayscale values. Since all pages reference these variables, a single change applies everywhere.

### Color mapping

| Variable | Current | New | Role |
|----------|---------|-----|------|
| `--color-astro-dark` | `#0a0a1a` | `#121212` | App background |
| `--color-astro-panel` | `#12122a` | `#222222` | Card/panel background |
| `--color-astro-accent` | `#4f7cff` | `#999999` | Data accents, progress bars |
| `--color-astro-muted` | `#6b7280` | `#777777` | Secondary text |

### Unchanged

- Filter colors (`filter-ha`, `filter-oiii`, `filter-sii`, `filter-l`, `filter-r`, `filter-g`, `filter-b`) — these are functional astronomy colors, not decorative
- Text white (`#ffffff`, `#e5e5e5`) — remains as-is
- Error/success states (`text-red-400`, `text-green-400`) — functional colors

### Border updates

Components using `border-gray-800` should update to `border-[#2d2d2d]` for consistency with the spec.

---

## 4. Files Changed

### Backend
- `backend/app/services/thumbnail.py` — Replace `_stretch_channel` with MTF algorithm, reorder pipeline (resize before stretch)

### Frontend
- `frontend/src/index.css` — Update `@theme` color variables

### Component border updates (frontend) — `border-gray-800` → `border-[#2d2d2d]`
- `frontend/src/components/NavBar.tsx`
- `frontend/src/components/IngestHistory.tsx`
- `frontend/src/components/SessionTable.tsx`
- `frontend/src/components/EquipmentInventory.tsx`
- `frontend/src/components/DetailDrawer.tsx`
- `frontend/src/components/CommandBar.tsx`
- `frontend/src/components/RawHeaderAccordion.tsx`
- `frontend/src/components/Sidebar.tsx`

---

## 5. Thumbnail Regeneration

Existing thumbnails were generated with the old algorithm. After deploying the new stretch, a re-scan or manual regeneration of thumbnails is needed to see the improvement. This is an operational step, not a code change.

---

## 6. Out of Scope

- Configurable stretch parameters (autostretch factor, black clipping) in the UI
- Per-image stretch tuning
- Admin page layout/typography changes beyond color palette
- Background geometric elements from the full Matte Grey Theme spec (decorative, not functional)
