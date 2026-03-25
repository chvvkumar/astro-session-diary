import pytest
import numpy as np
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
from astropy.io import fits

from app.services.scanner import extract_metadata
from app.services.thumbnail import generate_thumbnail


@pytest.fixture
def sample_fits(tmp_path: Path) -> Path:
    data = np.random.default_rng(42).normal(1000, 50, (128, 128)).astype(np.float32)
    hdu = fits.PrimaryHDU(data)
    hdu.header["OBJECT"] = "NGC 7000"
    hdu.header["EXPTIME"] = 600.0
    hdu.header["FILTER"] = "OIII"
    hdu.header["CCD-TEMP"] = -15.0
    hdu.header["GAIN"] = 100
    hdu.header["DATE-OBS"] = "2024-06-15T01:30:00"
    path = tmp_path / "Light_NGC7000_001.fits"
    hdu.writeto(path)
    return path


def test_full_ingest_pipeline(sample_fits: Path, tmp_path: Path):
    """Integration test: extract metadata + generate thumbnail for a single file."""
    meta = extract_metadata(sample_fits)
    assert meta["object_name"] == "NGC 7000"
    assert meta["filter_used"] == "OIII"

    thumb_path = tmp_path / "thumbnails" / "thumb.jpg"
    result = generate_thumbnail(sample_fits, thumb_path, max_width=200)
    assert result.exists()
