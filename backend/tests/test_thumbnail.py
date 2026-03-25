import numpy as np
import pytest
from astropy.io import fits
from pathlib import Path
from PIL import Image as PILImage

from app.services.thumbnail import generate_thumbnail


@pytest.fixture
def sample_fits_mono(tmp_path: Path) -> Path:
    """Create a minimal mono FITS file with synthetic star field."""
    rng = np.random.default_rng(42)
    # Background sky + a few bright "stars"
    data = rng.normal(loc=1000, scale=50, size=(256, 256)).astype(np.float32)
    data[128, 128] = 50000  # bright star
    data[64, 192] = 30000   # dimmer star

    hdu = fits.PrimaryHDU(data)
    hdu.header["OBJECT"] = "TestTarget"
    hdu.header["EXPTIME"] = 300.0
    file_path = tmp_path / "test_mono.fits"
    hdu.writeto(file_path)
    return file_path


@pytest.fixture
def sample_fits_color(tmp_path: Path) -> Path:
    """Create a minimal 3-channel color FITS file."""
    rng = np.random.default_rng(42)
    data = rng.normal(loc=1000, scale=50, size=(3, 128, 128)).astype(np.float32)
    data[0, 64, 64] = 40000  # red channel star
    data[1, 64, 64] = 45000  # green channel star
    data[2, 64, 64] = 35000  # blue channel star

    hdu = fits.PrimaryHDU(data)
    file_path = tmp_path / "test_color.fits"
    hdu.writeto(file_path)
    return file_path


def test_generate_thumbnail_mono(sample_fits_mono: Path, tmp_path: Path):
    output = tmp_path / "thumb.jpg"
    result = generate_thumbnail(sample_fits_mono, output, max_width=400)

    assert result == output
    assert output.exists()
    img = PILImage.open(output)
    assert img.width <= 400
    assert img.mode == "L" or img.mode == "RGB"


def test_generate_thumbnail_color(sample_fits_color: Path, tmp_path: Path):
    output = tmp_path / "thumb_color.jpg"
    result = generate_thumbnail(sample_fits_color, output, max_width=400)

    assert result == output
    assert output.exists()
    img = PILImage.open(output)
    assert img.width <= 400
    assert img.mode == "RGB"


def test_generate_thumbnail_respects_max_width(sample_fits_mono: Path, tmp_path: Path):
    output = tmp_path / "thumb_small.jpg"
    generate_thumbnail(sample_fits_mono, output, max_width=100)

    img = PILImage.open(output)
    assert img.width <= 100
