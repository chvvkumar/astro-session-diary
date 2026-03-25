from pathlib import Path
from datetime import datetime
from typing import Any, Iterator

from astropy.io import fits

FITS_EXTENSIONS = {".fits", ".fit", ".fts", ".FITS", ".FIT", ".FTS"}


def scan_directory(
    root: Path,
    known_paths: set[str] | None = None,
) -> Iterator[Path]:
    """Walk a directory tree yielding FITS file paths not in known_paths."""
    known = known_paths or set()
    for path in root.rglob("*"):
        if path.suffix in FITS_EXTENSIONS and str(path) not in known:
            yield path


def _first_float(header, *keys) -> float | None:
    """Return the first non-None float value found among the given header keys."""
    for key in keys:
        val = header.get(key)
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                continue
    return None


def extract_metadata(fits_path: Path) -> dict[str, Any]:
    """Extract structured metadata and raw headers from a FITS file."""
    with fits.open(fits_path) as hdul:
        header = hdul[0].header

    raw_headers = {k: _serialize_header_value(v) for k, v in header.items() if k}

    capture_date = None
    date_obs = header.get("DATE-OBS")
    if date_obs:
        try:
            capture_date = datetime.fromisoformat(date_obs)
        except ValueError:
            pass

    return {
        "file_path": str(fits_path),
        "file_name": fits_path.name,
        "object_name": header.get("OBJECT"),
        "exposure_time": header.get("EXPTIME"),
        "filter_used": header.get("FILTER"),
        "sensor_temp": header.get("CCD-TEMP"),
        "camera_gain": int(header.get("GAIN")) if header.get("GAIN") is not None else None,
        "image_type": header.get("IMAGETYP"),
        "telescope": header.get("TELESCOP"),
        "camera": header.get("INSTRUME"),
        "median_hfr": _first_float(header, "HFR", "MEANFWHM", "FWHM"),
        "eccentricity": _first_float(header, "ECCENTRICITY", "ELLIPTICITY"),
        "capture_date": capture_date,
        "raw_headers": raw_headers,
    }


def _serialize_header_value(value: Any) -> Any:
    """Ensure header values are JSON-serializable."""
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    return str(value)
