# MTF Thumbnail Stretch & Matte Grey Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace washed-out thumbnail stretch with N.I.N.A.-equivalent MTF algorithm and switch the global CSS palette to pure monochromatic matte grey.

**Architecture:** Two independent changes. Backend: rewrite `_stretch_channel` in `thumbnail.py` with MTF rational curve (median/MAD stats → shadows clip → midtone transfer), reorder pipeline to resize before stretch. Frontend: swap 4 CSS custom properties and update `border-gray-800` references across 8 components.

**Tech Stack:** Python (numpy, astropy, Pillow), Tailwind CSS v4.2, Solid.js

**Spec:** `docs/superpowers/specs/2026-03-25-mtf-stretch-and-matte-grey-theme.md`

---

## File Structure

### Backend
- **Modify:** `backend/app/services/thumbnail.py` — Replace `_stretch_channel` with MTF, reorder `generate_thumbnail` pipeline
- **Modify:** `backend/tests/test_thumbnail.py` — Add MTF-specific tests (dark sky, star contrast, edge cases)

### Frontend
- **Modify:** `frontend/src/index.css` — Update `@theme` color variables
- **Modify:** `frontend/src/components/NavBar.tsx:6` — border color
- **Modify:** `frontend/src/components/CommandBar.tsx:9` — border color
- **Modify:** `frontend/src/components/Sidebar.tsx:10` — border color
- **Modify:** `frontend/src/components/DetailDrawer.tsx:16` — border color
- **Modify:** `frontend/src/components/SessionTable.tsx:13,16,27` — border colors
- **Modify:** `frontend/src/components/RawHeaderAccordion.tsx:12,31` — border colors
- **Modify:** `frontend/src/components/EquipmentInventory.tsx:12,21` — border colors
- **Modify:** `frontend/src/components/IngestHistory.tsx:10` — border color

---

## Task 1: MTF Stretch Algorithm — Tests

**Files:**
- Modify: `backend/tests/test_thumbnail.py`

- [ ] **Step 1: Add test for dark sky background in mono thumbnail**

The MTF stretch should produce a dark sky background (median pixel value in the lower quartile) for images with faint signal. Add this test after the existing tests:

```python
def test_mtf_stretch_dark_sky_background(sample_fits_mono: Path, tmp_path: Path):
    """MTF stretch should produce dark sky, not washed-out white."""
    output = tmp_path / "thumb_mtf.jpg"
    generate_thumbnail(sample_fits_mono, output, max_width=256)

    img = PILImage.open(output)
    pixels = np.array(img)
    # Background sky (median) should be dark — below 64 on 0-255 scale
    # The MTF lifts faint signal but keeps background subdued
    assert np.median(pixels) < 64, (
        f"Sky background too bright: median={np.median(pixels):.0f}, "
        f"expected < 64 for proper MTF stretch"
    )
```

- [ ] **Step 2: Add test for star contrast preservation**

Stars should remain bright relative to background after MTF stretch:

```python
def test_mtf_stretch_star_contrast(sample_fits_mono: Path, tmp_path: Path):
    """MTF stretch should preserve bright stars against dark background."""
    output = tmp_path / "thumb_contrast.jpg"
    generate_thumbnail(sample_fits_mono, output, max_width=256)

    img = PILImage.open(output)
    pixels = np.array(img)
    # Stars (max pixel) should be significantly brighter than background (median)
    contrast = float(np.max(pixels)) - float(np.median(pixels))
    assert contrast > 100, (
        f"Insufficient star/sky contrast: {contrast:.0f}, expected > 100"
    )
```

- [ ] **Step 3: Add test for uniform image edge case**

When MAD is zero (uniform image), the stretch should not crash:

```python
def test_mtf_stretch_uniform_image(tmp_path: Path):
    """Uniform image (MAD=0) should produce valid thumbnail without crashing."""
    data = np.full((128, 128), 1000.0, dtype=np.float32)
    hdu = fits.PrimaryHDU(data)
    fits_path = tmp_path / "uniform.fits"
    hdu.writeto(fits_path)

    output = tmp_path / "thumb_uniform.jpg"
    result = generate_thumbnail(fits_path, output, max_width=128)
    assert result == output
    assert output.exists()
    img = PILImage.open(output)
    assert img.width <= 128
    # With m=0.5 fallback, uniform input should map to mid-grey (not all-black or all-white)
    pixels = np.array(img)
    assert 0 < np.median(pixels) < 255, "Uniform image should not be all-black or all-white"
```

- [ ] **Step 4: Run all new tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_thumbnail.py -v -k "dark_sky or star_contrast or uniform"`

Expected: `test_mtf_stretch_dark_sky_background` and `test_mtf_stretch_star_contrast` should FAIL (current ZScale+Asinh produces washed-out output). `test_mtf_stretch_uniform_image` may pass or fail depending on ZScale behavior with uniform data.

- [ ] **Step 5: Commit the failing tests**

```bash
git add backend/tests/test_thumbnail.py
git commit -m "test: add MTF stretch tests for dark sky, star contrast, and uniform edge case"
```

---

## Task 2: MTF Stretch Algorithm — Implementation

**Files:**
- Modify: `backend/app/services/thumbnail.py`

- [ ] **Step 1: Replace `_stretch_channel` with MTF algorithm**

Replace the entire `_stretch_channel` function and its imports:

```python
from pathlib import Path

import numpy as np
from astropy.io import fits
from PIL import Image as PILImage


def _mtf(x: np.ndarray, m: float) -> np.ndarray:
    """Apply Midtones Transfer Function (MTF) rational curve.

    f(x) = (m - 1) * x / ((2m - 1) * x - m)

    Equivalent to N.I.N.A. / PixInsight Auto STF.
    """
    return (m - 1.0) * x / ((2.0 * m - 1.0) * x - m)


def _stretch_channel(data: np.ndarray) -> np.ndarray:
    """Apply N.I.N.A.-equivalent MTF stretch to a single 2D channel.

    Algorithm:
    1. Compute median and MAD (Median Absolute Deviation)
    2. Calculate shadows clipping point and midtone balance
    3. Apply MTF rational curve
    """
    median = float(np.median(data))
    mad = float(np.median(np.abs(data - median)))

    # Default midtone for uniform images (MAD=0)
    midtone = 0.5
    shadows = 0.0

    if mad > 0:
        # Shadows clipping: 2.8 is N.I.N.A. default autostretch factor
        shadows = median - 2.8 * mad
        if shadows < 0:
            shadows = 0.0
        if shadows >= 1.0:
            shadows = 0.0

        # Normalize and compute midtone balance
        scale = 1.0 - shadows
        if scale <= 0:
            scale = 1.0
        midtone = (median - shadows) / scale
        midtone = float(np.clip(midtone, 0.001, 0.999))

    # Normalize to [0, 1] relative to shadows..1.0 range
    scale = 1.0 - shadows
    if scale <= 0:
        scale = 1.0
    normed = (data - shadows) / scale
    normed = np.clip(normed, 0.0, 1.0)

    # Apply MTF rational curve
    stretched = _mtf(normed, midtone)
    return (stretched * 255).astype(np.uint8)
```

- [ ] **Step 2: Rewrite `generate_thumbnail` to resize before stretch**

Replace the `generate_thumbnail` function. The key change is: read raw float data → flip → resize on raw linear values → then stretch the smaller image.

```python
def generate_thumbnail(
    fits_path: Path,
    output_path: Path,
    max_width: int = 800,
) -> Path:
    """Read a FITS file, resize raw data, apply MTF stretch, save JPEG.

    Pipeline: read → flip → resize (raw linear) → MTF stretch → save.
    Handles both mono (2D) and color (3D with shape [3, H, W]) data.
    """
    with fits.open(fits_path) as hdul:
        data = hdul[0].data.astype(np.float32)

    if data.ndim == 2:
        # Mono: normalize, flip, resize, stretch
        data = _normalize_to_unit(data)
        flipped = np.flipud(data)
        resized = _resize_array(flipped, max_width)
        stretched = _stretch_channel(resized)
        img = PILImage.fromarray(stretched, mode="L")
    elif data.ndim == 3 and data.shape[0] == 3:
        # Color: normalize, flip, resize, stretch each channel independently (unlinked)
        channels = []
        for i in range(3):
            ch = _normalize_to_unit(data[i])
            flipped = np.flipud(ch)
            resized = _resize_array(flipped, max_width)
            stretched = _stretch_channel(resized)
            channels.append(stretched)
        rgb = np.stack(channels, axis=-1)
        img = PILImage.fromarray(rgb, mode="RGB")
    else:
        raise ValueError(f"Unsupported FITS data shape: {data.shape}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "JPEG", quality=85)
    return output_path
```

- [ ] **Step 3: Add the `_normalize_to_unit` and `_resize_array` helpers**

Add these between `_stretch_channel` and `generate_thumbnail`:

```python
def _normalize_to_unit(data: np.ndarray) -> np.ndarray:
    """Normalize a 2D array to [0, 1] range based on its min/max."""
    dmin = float(np.min(data))
    dmax = float(np.max(data))
    if dmax > dmin:
        return (data - dmin) / (dmax - dmin)
    return np.zeros_like(data)
```

```python
def _resize_array(data: np.ndarray, max_width: int) -> np.ndarray:
    """Resize a 2D float array maintaining aspect ratio using LANCZOS.

    Uses PIL mode "F" (32-bit float) for high-quality resampling
    on raw linear float data without precision loss.
    """
    h, w = data.shape
    if w <= max_width:
        return data

    ratio = max_width / w
    new_h = int(h * ratio)

    img = PILImage.fromarray(data, mode="F")
    img = img.resize((max_width, new_h), PILImage.LANCZOS)
    return np.array(img)
```

- [ ] **Step 4: Run all thumbnail tests**

Run: `cd backend && python -m pytest tests/test_thumbnail.py -v`

Expected: All 6 tests pass (3 existing + 3 new MTF tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/thumbnail.py
git commit -m "feat: replace ZScale+Asinh with N.I.N.A. MTF stretch for thumbnails

Implements the Midtones Transfer Function (median/MAD stats, shadows
clipping, rational curve) equivalent to N.I.N.A./PixInsight Auto STF.
Pipeline reordered: resize raw linear data first, then stretch."
```

---

## Task 3: Matte Grey Theme — CSS Variables

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Update the `@theme` color variables**

Replace the 4 astro color values (lines 4-7 of `index.css`):

```css
@theme {
  --color-astro-dark: #121212;
  --color-astro-panel: #222222;
  --color-astro-accent: #999999;
  --color-astro-muted: #777777;
  --color-filter-ha: #c44040;
  --color-filter-oiii: #3a8fd4;
  --color-filter-sii: #d4a43a;
  --color-filter-l: #e0e0e0;
  --color-filter-r: #e05050;
  --color-filter-g: #50b050;
  --color-filter-b: #5070e0;
}
```

Filter colors remain unchanged — they are functional astronomy colors.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: switch global palette to matte grey monochromatic theme"
```

---

## Task 4: Matte Grey Theme — Border Color Updates

**Files:**
- Modify: 8 component files (see list below)

All instances of `border-gray-800` (including variants like `border-gray-800/30`, `border-gray-800/50`) change to `border-[#2d2d2d]` (and `border-[#2d2d2d]/30`, `border-[#2d2d2d]/50` for opacity variants).

- [ ] **Step 1: Update `NavBar.tsx` line 6**

`border-gray-800` → `border-[#2d2d2d]`

- [ ] **Step 2: Update `CommandBar.tsx` line 9**

`border-gray-800` → `border-[#2d2d2d]`

- [ ] **Step 3: Update `Sidebar.tsx` line 10**

`border-gray-800` → `border-[#2d2d2d]`

- [ ] **Step 4: Update `DetailDrawer.tsx` line 16**

`border-gray-800` → `border-[#2d2d2d]`

- [ ] **Step 5: Update `SessionTable.tsx` lines 13, 16, 27**

- Line 13: `border-gray-800` → `border-[#2d2d2d]`
- Line 16: `border-gray-800` → `border-[#2d2d2d]`
- Line 27: `border-gray-800/50` → `border-[#2d2d2d]/50`

- [ ] **Step 6: Update `RawHeaderAccordion.tsx` lines 12, 31**

- Line 12: `border-gray-800` → `border-[#2d2d2d]`
- Line 31: `border-gray-800/30` → `border-[#2d2d2d]/30`

- [ ] **Step 7: Update `EquipmentInventory.tsx` lines 12, 21**

- Line 12: `border-gray-800/30` → `border-[#2d2d2d]/30`
- Line 21: `border-gray-800/30` → `border-[#2d2d2d]/30`

- [ ] **Step 8: Update `IngestHistory.tsx` line 10**

`border-gray-800/30` → `border-[#2d2d2d]/30`

- [ ] **Step 9: Verify no remaining `border-gray-800` in components**

Run: `grep -r "border-gray-800" frontend/src/`

Expected: No matches.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/NavBar.tsx frontend/src/components/CommandBar.tsx \
  frontend/src/components/Sidebar.tsx frontend/src/components/DetailDrawer.tsx \
  frontend/src/components/SessionTable.tsx frontend/src/components/RawHeaderAccordion.tsx \
  frontend/src/components/EquipmentInventory.tsx frontend/src/components/IngestHistory.tsx
git commit -m "style: update border colors to #2d2d2d for matte grey theme"
```

---

## Task 5: Visual Verification

- [ ] **Step 1: Build the frontend**

Run: `cd frontend && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run backend tests**

Run: `cd backend && python -m pytest tests/test_thumbnail.py -v`

Expected: All tests pass.

- [ ] **Step 3: Regenerate existing thumbnails**

Existing thumbnails were generated with the old ZScale+Asinh algorithm. Trigger a re-scan from the admin page to regenerate all thumbnails with the new MTF stretch.

- [ ] **Step 4: Verify visually (manual)**

Start the app and check:
1. Thumbnails show dark sky background with visible faint structure
2. Stars are bright but not bloated
3. Admin page has `#121212` background, `#222222` card panels
4. Borders are subtle `#2d2d2d` grey
5. Filter colors (Ha red, OIII blue, etc.) unchanged
