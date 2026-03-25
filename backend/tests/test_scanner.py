import pytest
from pathlib import Path
from astropy.io import fits
import numpy as np

from app.services.scanner import scan_directory, extract_metadata


@pytest.fixture
def fits_tree(tmp_path: Path) -> Path:
    """Create a directory tree with FITS files and non-FITS files."""
    # Create FITS files in subdirectories
    for subdir in ["2024-01-15", "2024-01-16"]:
        d = tmp_path / subdir
        d.mkdir()
        for i in range(3):
            data = np.zeros((64, 64), dtype=np.float32)
            hdu = fits.PrimaryHDU(data)
            hdu.header["OBJECT"] = "M31"
            hdu.header["EXPTIME"] = 300.0
            hdu.header["FILTER"] = "Ha"
            hdu.header["CCD-TEMP"] = -10.0
            hdu.header["GAIN"] = 120
            hdu.header["DATE-OBS"] = f"2024-01-{15 + int(subdir[-2:])-15}T22:{i:02d}:00"
            hdu.writeto(d / f"Light_{i:03d}.fits")

    # Non-FITS file (should be ignored)
    (tmp_path / "notes.txt").write_text("session notes")
    return tmp_path


def test_scan_directory_finds_all_fits(fits_tree: Path):
    found = list(scan_directory(fits_tree))
    assert len(found) == 6
    assert all(f.suffix == ".fits" for f in found)


def test_scan_directory_excludes_known_paths(fits_tree: Path):
    known = {str(fits_tree / "2024-01-15" / "Light_000.fits")}
    found = list(scan_directory(fits_tree, known_paths=known))
    assert len(found) == 5


def test_extract_metadata(fits_tree: Path):
    fits_file = fits_tree / "2024-01-15" / "Light_000.fits"
    meta = extract_metadata(fits_file)

    assert meta["file_name"] == "Light_000.fits"
    assert meta["object_name"] == "M31"
    assert meta["exposure_time"] == 300.0
    assert meta["filter_used"] == "Ha"
    assert meta["sensor_temp"] == -10.0
    assert meta["camera_gain"] == 120
    assert "OBJECT" in meta["raw_headers"]
    assert meta["capture_date"] is not None
