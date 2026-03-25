from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.visualization import ZScaleInterval, AsinhStretch
from PIL import Image as PILImage


def _stretch_channel(data: np.ndarray) -> np.ndarray:
    """Apply ZScale + Asinh stretch to a single 2D channel."""
    interval = ZScaleInterval()
    vmin, vmax = interval.get_limits(data)
    # Normalize to [0, 1]
    normed = (data - vmin) / (vmax - vmin + 1e-10)
    normed = np.clip(normed, 0, 1)
    # Asinh stretch to reveal faint detail without blowing out stars
    stretch = AsinhStretch(a=0.1)
    stretched = stretch(normed)
    return (stretched * 255).astype(np.uint8)


def generate_thumbnail(
    fits_path: Path,
    output_path: Path,
    max_width: int = 800,
) -> Path:
    """Read a FITS file, apply MTF stretch, and save a JPEG thumbnail.

    Handles both mono (2D) and color (3D with shape [3, H, W]) data.
    Flips the image origin (FITS convention is bottom-up).
    """
    with fits.open(fits_path) as hdul:
        data = hdul[0].data.astype(np.float32)

    if data.ndim == 2:
        # Mono image
        stretched = _stretch_channel(data)
        img = PILImage.fromarray(np.flipud(stretched), mode="L")
    elif data.ndim == 3 and data.shape[0] == 3:
        # Color image: stretch each channel independently
        channels = [_stretch_channel(data[i]) for i in range(3)]
        rgb = np.stack([np.flipud(c) for c in channels], axis=-1)
        img = PILImage.fromarray(rgb, mode="RGB")
    else:
        raise ValueError(f"Unsupported FITS data shape: {data.shape}")

    # Resize maintaining aspect ratio
    if img.width > max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), PILImage.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "JPEG", quality=85)
    return output_path
