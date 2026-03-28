# N.I.N.A. Session Metadata CSV Integration

## Summary

Integrate per-frame quality, guiding, focuser, ADU, weather, and mount metrics from N.I.N.A.'s Session Metadata plugin CSV files into the ingestion pipeline. Add a Display settings tab allowing users to toggle metric groups and individual fields on/off.

## Background

The app currently extracts HFR and eccentricity from FITS headers, but N.I.N.A. doesn't write these to headers. Out of 79,333 images, only 2,726 have HFR (all 0.0 from filename parsing) and 0 have eccentricity. The Session Metadata plugin writes rich per-frame data to `ImageMetaData.csv` and `WeatherData.csv` files alongside the FITS files. These CSVs are synced to the server NAS as part of the user's existing workflow.

## Data Sources

### ImageMetaData.csv (per-frame, co-located with FITS files)

| CSV Column | DB Column | Type | Group |
|---|---|---|---|
| HFR | `median_hfr` (existing) | Float | quality |
| HFRStDev | `hfr_stdev` | Float | quality |
| FWHM | `fwhm` | Float | quality |
| Eccentricity | `eccentricity` (existing) | Float | quality |
| DetectedStars | `detected_stars` | Integer | quality |
| GuidingRMSArcSec | `guiding_rms_arcsec` | Float | guiding |
| GuidingRMSRAArcSec | `guiding_rms_ra_arcsec` | Float | guiding |
| GuidingRMSDECArcSec | `guiding_rms_dec_arcsec` | Float | guiding |
| ADUStDev | `adu_stdev` | Float | adu |
| ADUMean | `adu_mean` | Float | adu |
| ADUMedian | `adu_median` | Float | adu |
| ADUMin | `adu_min` | Integer | adu |
| ADUMax | `adu_max` | Integer | adu |
| FocuserPosition | `focuser_position` | Integer | focuser |
| FocuserTemp | `focuser_temp` | Float | focuser |
| RotatorPosition | `rotator_position` | Float | mount |
| PierSide | `pier_side` | String(10) | mount |
| Airmass | `airmass` | Float | mount |

### WeatherData.csv (per-frame, co-located, matched by ExposureStartUTC)

| CSV Column | DB Column | Type | Group |
|---|---|---|---|
| Temperature | `ambient_temp` | Float | weather |
| DewPoint | `dew_point` | Float | weather |
| Humidity | `humidity` | Float | weather |
| Pressure | `pressure` | Float | weather |
| WindSpeed | `wind_speed` | Float | weather |
| WindDirection | `wind_direction` | Float | weather |
| WindGust | `wind_gust` | Float | weather |
| CloudCover | `cloud_cover` | Float | weather |
| SkyQuality | `sky_quality` | Float | weather |

**Total: 25 new columns + 2 existing columns updated from CSV.**

## Architecture

### 1. New service: `backend/app/services/csv_metadata.py`

Responsible for parsing and caching CSV data.

```
parse_image_metadata_csv(directory: Path) -> dict[str, dict]
```
- Reads `ImageMetaData.csv` from the given directory
- Returns a dict keyed by filename (extracted from the `FilePath` column)
- NaN values and HFR == 0.0 are converted to None
- Uses `functools.lru_cache` keyed by directory path so each CSV is parsed once per scan cycle

```
parse_weather_csv(directory: Path) -> dict[str, dict]
```
- Reads `WeatherData.csv` from the given directory
- Returns a dict keyed by `ExposureStartUTC`
- NaN values converted to None
- Same LRU caching strategy

```
get_csv_metrics(fits_path: Path) -> dict
```
- Convenience function: looks up metrics for a single FITS file
- Calls `parse_image_metadata_csv` for the parent directory
- Matches by filename
- Joins weather data by matching `ExposureStartUTC` from the image CSV row
- Returns a flat dict of all metric fields, or empty dict if no CSV found

### 2. Scanner enrichment (Part A: ingest-time)

In `scanner.py` `extract_metadata()`:
- After extracting FITS headers, call `get_csv_metrics(fits_path)`
- Merge CSV values into the metadata dict
- CSV values take priority over FITS header values for `median_hfr` and `eccentricity`

### 3. Backfill Celery task (Part B: catch stragglers)

New task `backfill_csv_metrics` in `tasks.py`:
1. Walk `settings.fits_data_path` recursively for `ImageMetaData.csv` files
2. For each CSV directory, query images in that directory where `median_hfr IS NULL`
3. Parse CSV + WeatherData.csv, match by filename
4. Bulk-update matched Image rows
5. Track progress via existing scan-state Redis mechanism

New API endpoint: `POST /api/scan/backfill-csv`
- Dispatches the backfill task
- Returns immediately (async like existing scan endpoints)

### 4. Database migration

Alembic migration adding 25 nullable columns to the `images` table plus a `display` JSONB column on `user_settings`.

### 5. API schema changes

**`FrameRecord`** (in `backend/app/schemas/target.py`): Add all 25 new fields as `float | None` or `int | None`.

**`SessionOverview`**: Add session-level medians for key metrics:
- `median_fwhm`, `median_detected_stars`
- `median_guiding_rms_arcsec`

**`SessionDetailResponse`**: Add session-level aggregates:
- `median_fwhm`, `min_fwhm`, `max_fwhm`
- `median_guiding_rms`, `min_guiding_rms`, `max_guiding_rms`
- `median_detected_stars`
- `median_airmass`
- `median_ambient_temp`, `median_humidity`, `median_cloud_cover`

**`TargetDetailResponse`**: Add target-level averages:
- `avg_fwhm`, `avg_guiding_rms_arcsec`, `avg_detected_stars`

### 6. API query changes

In `backend/app/api/targets.py`:
- Target detail endpoint: compute aggregates for new fields alongside existing HFR/eccentricity
- Session detail endpoint: compute per-session stats for new fields
- Frame records: include all new fields from the Image model

### 7. Display Settings

#### Backend

New JSONB column `display` on `UserSettings` (default `{}`).

Schema:

```python
class MetricGroupSettings(BaseModel):
    enabled: bool
    fields: dict[str, bool]

class DisplaySettings(BaseModel):
    quality: MetricGroupSettings  # hfr, hfr_stdev, fwhm, eccentricity, detected_stars
    guiding: MetricGroupSettings  # rms_total, rms_ra, rms_dec
    adu: MetricGroupSettings      # mean, median, stdev, min, max
    focuser: MetricGroupSettings  # position, temp
    weather: MetricGroupSettings  # ambient_temp, dew_point, humidity, pressure, wind_speed, wind_direction, wind_gust, cloud_cover, sky_quality
    mount: MetricGroupSettings    # airmass, pier_side, rotator_position
```

Defaults:
- `quality` and `guiding`: enabled=True, all fields True
- `adu`, `focuser`, `weather`, `mount`: enabled=False, all fields True

New endpoint: `PUT /settings/display`

#### Frontend

New `DisplaySettings` TypeScript interface mirroring the backend schema.

New "Display" tab on the Settings page:
- Each metric group rendered as a collapsible section
- Master toggle (switch) enables/disables the entire group
- Individual checkboxes underneath for each field within the group
- When group is disabled, individual checkboxes are visually dimmed
- A field is visible in the UI only if group `enabled` AND field value is `true`

Settings context updated with `saveDisplay` method and `displaySettings` accessor.

#### Frontend display integration

The session table (`TargetDetailPage.tsx`) and frame table (`SessionAccordionCard.tsx`) read display settings from context and conditionally render columns. The hero stat cards on the target detail page also respect these settings.

## Matching Strategy

- `ImageMetaData.csv` lives in the same directory as the LIGHT frames
- Match CSV rows to FITS files by **filename only** (unique within a directory)
- Extract filename from the CSV `FilePath` column (Windows path) using the last path segment
- Match `WeatherData.csv` rows to `ImageMetaData.csv` rows by `ExposureStartUTC`

## Edge Cases

- **CSV arrives after FITS**: The backfill task handles this. User triggers it manually from the UI via a button on the Scan & Ingest settings tab or the Admin & Stats page.
- **Missing CSV**: No error, metrics stay NULL. The UI already handles NULL with "—".
- **NaN values in CSV**: Treated as None (N.I.N.A. writes NaN when a metric couldn't be computed, e.g., FWHM when plate solve fails).
- **HFR == 0.0**: Treated as None (N.I.N.A. writes 0.0 when star detection fails).
- **Partial weather data**: Weather fields are independently nullable. If WeatherData.csv is missing, only image metrics are populated.

## Out of Scope

- Backfilling historical images (no CSVs exist for past sessions)
- AcquisitionDetails.csv parsing (data already captured from FITS headers)
- Per-frame graphs/charts for new metrics (can be added later)
- Pixel-unit guiding RMS fields (arcsec versions are more useful)
