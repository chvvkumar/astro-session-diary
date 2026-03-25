# AstroLog UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gallery-centric image browser with a data-first target aggregation dashboard and admin analytics page.

**Architecture:** Two-page SPA with `@solidjs/router`. Dashboard page has persistent sidebar filters + target feed + detail drawer. Admin page has scan management + full database analytics. Backend evolves existing endpoints for target aggregation, adds session detail, equipment, and stats endpoints. Database migration adds quality metrics and equipment columns.

**Tech Stack:** SolidJS 1.9.5, @solidjs/router, Tailwind CSS 4.2.2, FastAPI, SQLAlchemy 2.0, PostgreSQL, Alembic

**Spec:** `docs/superpowers/specs/2026-03-25-astrolog-ui-redesign.md`

---

## File Structure

### Backend — New Files
- `backend/app/api/stats.py` — `GET /api/stats` endpoint returning all admin analytics
- `backend/app/schemas/stats.py` — Pydantic models for stats response
- `backend/alembic/versions/0001_add_quality_and_equipment_columns.py` — Migration adding `median_hfr`, `eccentricity`, `telescope`, `camera` to images

### Backend — Modified Files
- `backend/app/models/image.py` — Add 4 new columns + indexes
- `backend/app/schemas/image.py` — Add new fields to schemas
- `backend/app/schemas/target.py` — Add aggregation response models
- `backend/app/api/targets.py` — Add aggregation endpoint, equipment endpoint, session detail endpoint
- `backend/app/api/router.py` — Register stats router
- `backend/app/worker/tasks.py` — Extract telescope, camera, HFR, eccentricity during ingest
- `backend/app/services/scanner.py` — Extract additional FITS header fields

### Backend — Removed Files
- `backend/app/api/images.py` — Replaced by target aggregation

### Frontend — New Files
- `frontend/src/pages/DashboardPage.tsx` — Dashboard page assembling sidebar + feed + drawer
- `frontend/src/pages/AdminPage.tsx` — Admin page assembling all analytics widgets
- `frontend/src/components/NavBar.tsx` — Top navigation bar with route links
- `frontend/src/components/Sidebar.tsx` — Persistent left filter panel container
- `frontend/src/components/DateRangePicker.tsx` — Start/end date inputs
- `frontend/src/components/FilterToggles.tsx` — Optical filter pill toggles
- `frontend/src/components/HardwareSelects.tsx` — Camera + telescope dropdowns
- `frontend/src/components/FitsQueryBuilder.tsx` — Dynamic key-operator-value filter rows
- `frontend/src/components/CommandBar.tsx` — Sticky bar with aggregate widgets
- `frontend/src/components/AggregateWidgets.tsx` — Total time, targets, frames, disk usage
- `frontend/src/components/TargetFeed.tsx` — Scrollable target card list
- `frontend/src/components/TargetCard.tsx` — Single target with filter badges + session accordion
- `frontend/src/components/FilterBadges.tsx` — Colored pills per optical filter
- `frontend/src/components/SessionTable.tsx` — Accordion session rows per date
- `frontend/src/components/DetailDrawer.tsx` — Right slide-over drawer
- `frontend/src/components/ReferenceThumbnail.tsx` — Single stretched JPEG in drawer
- `frontend/src/components/QualityMetrics.tsx` — HFR, eccentricity, exposure stats
- `frontend/src/components/RawHeaderAccordion.tsx` — Full FITS header JSON dump
- `frontend/src/components/ScanManager.tsx` — Adapted ScanDashboard for admin page
- `frontend/src/components/DatabaseOverview.tsx` — 4 summary stat widgets
- `frontend/src/components/EquipmentInventory.tsx` — Cameras + telescopes with frame counts
- `frontend/src/components/FilterUsageChart.tsx` — Global time per optical filter
- `frontend/src/components/ImagingTimeline.tsx` — Monthly integration hours bar chart
- `frontend/src/components/TopTargets.tsx` — Ranked by total integration time
- `frontend/src/components/DataQuality.tsx` — HFR/eccentricity averages + distribution
- `frontend/src/components/StorageBreakdown.tsx` — FITS, thumbnails, DB sizes
- `frontend/src/components/IngestHistory.tsx` — Log of past scans with counts
- `frontend/src/store/stats.ts` — Admin page data store

### Frontend — Modified Files
- `frontend/package.json` — Add `@solidjs/router`
- `frontend/tailwind.config.js` — Add filter color palette
- `frontend/src/index.css` — Add filter color CSS variables
- `frontend/src/index.tsx` — Wrap with Router
- `frontend/src/App.tsx` — Router root with NavBar and routes
- `frontend/src/types/index.ts` — Rewrite type definitions for target aggregation
- `frontend/src/api/client.ts` — Add new endpoint functions
- `frontend/src/store/catalog.ts` — Rewrite for target aggregation model
- `frontend/src/components/SearchBar.tsx` — Adapt for new store interface

### Frontend — Removed Files
- `frontend/src/components/Gallery.tsx`
- `frontend/src/components/GalleryCard.tsx`
- `frontend/src/components/FilterPanel.tsx`
- `frontend/src/components/ImageDetail.tsx`

---

## Task 1: Database Migration & Model Changes

**Files:**
- Modify: `backend/app/models/image.py`
- Create: `backend/alembic/versions/0001_add_quality_and_equipment_columns.py`

- [ ] **Step 1: Add new columns to Image model**

In `backend/app/models/image.py`, add after the `image_type` column:

```python
# Equipment identification
telescope: Mapped[str | None] = mapped_column(String(255), nullable=True)
camera: Mapped[str | None] = mapped_column(String(255), nullable=True)

# Quality metrics
median_hfr: Mapped[float | None] = mapped_column(Float, nullable=True)
eccentricity: Mapped[float | None] = mapped_column(Float, nullable=True)
```

Add to `__table_args__`:
```python
Index("ix_images_telescope", "telescope"),
Index("ix_images_camera", "camera"),
```

- [ ] **Step 2: Create Alembic migration**

Create `backend/alembic/versions/0001_add_quality_and_equipment_columns.py`:

```python
"""Add quality metrics and equipment columns to images table.

Revision ID: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("images", sa.Column("telescope", sa.String(255), nullable=True))
    op.add_column("images", sa.Column("camera", sa.String(255), nullable=True))
    op.add_column("images", sa.Column("median_hfr", sa.Float, nullable=True))
    op.add_column("images", sa.Column("eccentricity", sa.Float, nullable=True))
    op.create_index("ix_images_telescope", "images", ["telescope"])
    op.create_index("ix_images_camera", "images", ["camera"])

def downgrade() -> None:
    op.drop_index("ix_images_camera", table_name="images")
    op.drop_index("ix_images_telescope", table_name="images")
    op.drop_column("images", "eccentricity")
    op.drop_column("images", "median_hfr")
    op.drop_column("images", "camera")
    op.drop_column("images", "telescope")
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/image.py backend/alembic/versions/0001_add_quality_and_equipment_columns.py
git commit -m "feat: add quality metrics and equipment columns to images table"
```

---

## Task 2: Backend Schemas

**Files:**
- Modify: `backend/app/schemas/image.py`
- Modify: `backend/app/schemas/target.py`
- Create: `backend/app/schemas/stats.py`
- Modify: `backend/app/schemas/__init__.py`

- [ ] **Step 1: Update image schemas with new fields**

In `backend/app/schemas/image.py`, add to `ImageBase`:
```python
telescope: str | None = None
camera: str | None = None
median_hfr: float | None = None
eccentricity: float | None = None
```

- [ ] **Step 2: Add target aggregation schemas**

In `backend/app/schemas/target.py`, add:

```python
class SessionSummary(BaseModel):
    session_date: str
    integration_seconds: float
    frame_count: int
    filters_used: list[str]

class TargetAggregation(BaseModel):
    target_id: uuid.UUID
    primary_name: str
    aliases: list[str] = []
    total_integration_seconds: float
    total_frames: int
    filter_distribution: dict[str, float]
    equipment: list[str]
    sessions: list[SessionSummary]

class AggregateStats(BaseModel):
    total_integration_seconds: float
    target_count: int
    total_frames: int
    disk_usage_bytes: int

class TargetAggregationResponse(BaseModel):
    targets: list[TargetAggregation]
    aggregates: AggregateStats

class SessionDetailResponse(BaseModel):
    target_name: str
    session_date: str
    thumbnail_url: str | None = None
    frame_count: int
    integration_seconds: float
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    filters_used: dict[str, int]
    equipment: dict[str, str | None]
    raw_reference_header: dict | None = None

class EquipmentResponse(BaseModel):
    cameras: list[str]
    telescopes: list[str]
```

- [ ] **Step 3: Create stats schemas**

Create `backend/app/schemas/stats.py`:

```python
from pydantic import BaseModel


class OverviewStats(BaseModel):
    total_integration_seconds: float
    target_count: int
    total_frames: int
    disk_usage_bytes: int


class EquipmentItem(BaseModel):
    name: str
    frame_count: int


class EquipmentStats(BaseModel):
    cameras: list[EquipmentItem]
    telescopes: list[EquipmentItem]


class TimelineEntry(BaseModel):
    month: str
    integration_seconds: float


class TopTarget(BaseModel):
    name: str
    integration_seconds: float


class HfrBucket(BaseModel):
    bucket: str
    count: int


class DataQualityStats(BaseModel):
    avg_hfr: float | None
    avg_eccentricity: float | None
    best_hfr: float | None
    hfr_distribution: list[HfrBucket]


class StorageStats(BaseModel):
    fits_bytes: int
    thumbnail_bytes: int
    database_bytes: int


class IngestEntry(BaseModel):
    date: str
    files_added: int


class StatsResponse(BaseModel):
    overview: OverviewStats
    equipment: EquipmentStats
    filter_usage: dict[str, float]
    timeline: list[TimelineEntry]
    top_targets: list[TopTarget]
    data_quality: DataQualityStats
    storage: StorageStats
    ingest_history: list[IngestEntry]
```

- [ ] **Step 4: Update schemas __init__.py**

Add new exports to `backend/app/schemas/__init__.py`:
```python
from .stats import StatsResponse
from .target import (
    TargetAggregationResponse, SessionDetailResponse, EquipmentResponse,
    TargetSearchResult, TargetRead
)
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat: add schemas for target aggregation, session detail, equipment, and stats"
```

---

## Task 3: Ingest Pipeline Changes

**Files:**
- Modify: `backend/app/services/scanner.py`
- Modify: `backend/app/worker/tasks.py`

- [ ] **Step 1: Extract additional FITS headers in scanner**

In `backend/app/services/scanner.py`, update `extract_metadata` to add after the existing fields:

```python
# Equipment identification
"telescope": header.get("TELESCOP"),
"camera": header.get("INSTRUME"),
# Quality metrics — try multiple common header keys
"median_hfr": _first_float(header, "HFR", "MEANFWHM", "FWHM"),
"eccentricity": _first_float(header, "ECCENTRICITY", "ELLIPTICITY"),
```

Add helper function:
```python
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
```

- [ ] **Step 2: Store new fields in worker task**

In `backend/app/worker/tasks.py`, update the `Image(...)` constructor to include:
```python
telescope=meta.get("telescope"),
camera=meta.get("camera"),
median_hfr=meta.get("median_hfr"),
eccentricity=meta.get("eccentricity"),
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/scanner.py backend/app/worker/tasks.py
git commit -m "feat: extract telescope, camera, HFR, and eccentricity from FITS headers"
```

---

## Task 4: Target Aggregation API Endpoint

**Files:**
- Modify: `backend/app/api/targets.py`

- [ ] **Step 1: Add GET /api/targets aggregation endpoint**

Add to `backend/app/api/targets.py`:

```python
from datetime import datetime
from sqlalchemy import case
from app.models import Image
from app.schemas.target import (
    TargetAggregationResponse, TargetAggregation, SessionSummary,
    AggregateStats, EquipmentResponse, SessionDetailResponse,
)

@router.get("", response_model=TargetAggregationResponse)
async def list_targets_aggregated(
    session: AsyncSession = Depends(get_session),
    search: str | None = Query(None),
    camera: str | None = Query(None),
    telescope: str | None = Query(None),
    filters: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    fits_key: list[str] | None = Query(None),
    fits_op: list[str] | None = Query(None),
    fits_val: list[str] | None = Query(None),
):
    """Return targets with aggregated session data, filtered by query params."""
    # Base query: only LIGHT frames with a resolved target
    base_filter = [Image.image_type == "LIGHT", Image.resolved_target_id.isnot(None)]

    if camera:
        base_filter.append(Image.camera == camera)
    if telescope:
        base_filter.append(Image.telescope == telescope)
    if filters:
        filter_list = [f.strip() for f in filters.split(",")]
        base_filter.append(Image.filter_used.in_(filter_list))
    if date_from:
        base_filter.append(Image.capture_date >= date_from)
    if date_to:
        base_filter.append(Image.capture_date <= date_to)
    if search:
        pattern = f"%{search}%"
        base_filter.append(
            or_(
                Target.primary_name.ilike(pattern),
                Target.aliases.any(func.upper(search)),
            )
        )

    # FITS header queries (AND logic between rows)
    if fits_key and fits_op and fits_val:
        for key, op_str, val in zip(fits_key, fits_op, fits_val):
            import re
            if not re.match(r'^[A-Za-z0-9_-]{1,20}$', key):
                continue
            json_field = Image.raw_headers[key].astext
            if op_str == "eq":
                base_filter.append(json_field == val)
            elif op_str == "neq":
                base_filter.append(json_field != val)
            elif op_str == "gt":
                base_filter.append(cast(json_field, Float) > float(val))
            elif op_str == "lt":
                base_filter.append(cast(json_field, Float) < float(val))
            elif op_str == "gte":
                base_filter.append(cast(json_field, Float) >= float(val))
            elif op_str == "lte":
                base_filter.append(cast(json_field, Float) <= float(val))
            elif op_str == "contains":
                base_filter.append(json_field.ilike(f"%{val}%"))

    # Query images joined with targets
    query = (
        select(Image, Target)
        .join(Target, Image.resolved_target_id == Target.id)
        .where(*base_filter)
        .order_by(Target.primary_name, Image.capture_date.desc())
    )
    result = await session.execute(query)
    rows = result.all()

    # Build target aggregations in Python
    from collections import defaultdict
    targets_map: dict[str, dict] = {}
    sessions_map: dict[str, dict[str, dict]] = defaultdict(dict)

    for image, target in rows:
        tid = str(target.id)
        if tid not in targets_map:
            targets_map[tid] = {
                "target_id": tid,
                "primary_name": target.primary_name,
                "aliases": target.aliases or [],
                "total_integration_seconds": 0,
                "total_frames": 0,
                "filter_distribution": defaultdict(float),
                "equipment_set": set(),
            }
        t = targets_map[tid]
        exp = image.exposure_time or 0
        t["total_integration_seconds"] += exp
        t["total_frames"] += 1
        if image.filter_used:
            t["filter_distribution"][image.filter_used] += exp
        if image.camera:
            t["equipment_set"].add(image.camera)
        if image.telescope:
            t["equipment_set"].add(image.telescope)

        # Session grouping
        date_key = image.capture_date.strftime("%Y-%m-%d") if image.capture_date else "unknown"
        if date_key not in sessions_map[tid]:
            sessions_map[tid][date_key] = {
                "session_date": date_key,
                "integration_seconds": 0,
                "frame_count": 0,
                "filters_set": set(),
            }
        s = sessions_map[tid][date_key]
        s["integration_seconds"] += exp
        s["frame_count"] += 1
        if image.filter_used:
            s["filters_set"].add(image.filter_used)

    # Assemble response
    target_list = []
    for tid, t in targets_map.items():
        sessions = []
        for s in sorted(sessions_map[tid].values(), key=lambda x: x["session_date"], reverse=True):
            sessions.append(SessionSummary(
                session_date=s["session_date"],
                integration_seconds=s["integration_seconds"],
                frame_count=s["frame_count"],
                filters_used=sorted(s["filters_set"]),
            ))
        target_list.append(TargetAggregation(
            target_id=t["target_id"],
            primary_name=t["primary_name"],
            aliases=t["aliases"],
            total_integration_seconds=t["total_integration_seconds"],
            total_frames=t["total_frames"],
            filter_distribution=dict(t["filter_distribution"]),
            equipment=sorted(t["equipment_set"]),
            sessions=sessions,
        ))

    target_list.sort(key=lambda x: x.total_integration_seconds, reverse=True)

    # Aggregates
    total_seconds = sum(t.total_integration_seconds for t in target_list)
    total_frames = sum(t.total_frames for t in target_list)

    # Disk usage: sum file sizes (approximate from raw_headers or use count * avg)
    disk_query = select(func.sum(func.pg_column_size(Image.raw_headers))).where(*base_filter).join(Target, Image.resolved_target_id == Target.id)
    try:
        disk_result = await session.execute(disk_query)
        disk_bytes = disk_result.scalar_one_or_none() or 0
    except Exception:
        disk_bytes = 0

    aggregates = AggregateStats(
        total_integration_seconds=total_seconds,
        target_count=len(target_list),
        total_frames=total_frames,
        disk_usage_bytes=disk_bytes,
    )

    return TargetAggregationResponse(targets=target_list, aggregates=aggregates)
```

- [ ] **Step 2: Add equipment endpoint**

```python
@router.get("/equipment", response_model=EquipmentResponse)
async def get_equipment(session: AsyncSession = Depends(get_session)):
    """Return distinct camera and telescope values."""
    cam_result = await session.execute(
        select(Image.camera).where(Image.camera.isnot(None)).distinct().order_by(Image.camera)
    )
    tel_result = await session.execute(
        select(Image.telescope).where(Image.telescope.isnot(None)).distinct().order_by(Image.telescope)
    )
    return EquipmentResponse(
        cameras=[r[0] for r in cam_result.all()],
        telescopes=[r[0] for r in tel_result.all()],
    )
```

- [ ] **Step 3: Add session detail endpoint**

```python
import statistics

@router.get("/{target_id}/sessions/{date}", response_model=SessionDetailResponse)
async def get_session_detail(
    target_id: uuid.UUID,
    date: str,
    session: AsyncSession = Depends(get_session),
):
    """Return detailed session data for a target on a specific date."""
    target = await session.get(Target, target_id)
    if not target:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Target not found")

    query = (
        select(Image)
        .where(
            Image.resolved_target_id == target_id,
            func.date(Image.capture_date) == date,
            Image.image_type == "LIGHT",
        )
        .order_by(Image.capture_date)
    )
    result = await session.execute(query)
    images = result.scalars().all()

    if not images:
        raise HTTPException(status_code=404, detail="No images found for this session")

    total_exp = sum(img.exposure_time or 0 for img in images)
    filters_used: dict[str, int] = {}
    hfr_values = []
    ecc_values = []

    for img in images:
        if img.filter_used:
            filters_used[img.filter_used] = filters_used.get(img.filter_used, 0) + 1
        if img.median_hfr is not None:
            hfr_values.append(img.median_hfr)
        if img.eccentricity is not None:
            ecc_values.append(img.eccentricity)

    ref_image = images[0]
    thumb_url = None
    if ref_image.thumbnail_path:
        filename = ref_image.thumbnail_path.split("/")[-1].split("\\")[-1]
        thumb_url = f"/thumbnails/{filename}"

    return SessionDetailResponse(
        target_name=target.primary_name,
        session_date=date,
        thumbnail_url=thumb_url,
        frame_count=len(images),
        integration_seconds=total_exp,
        median_hfr=statistics.median(hfr_values) if hfr_values else None,
        median_eccentricity=statistics.median(ecc_values) if ecc_values else None,
        filters_used=filters_used,
        equipment={
            "camera": ref_image.camera,
            "telescope": ref_image.telescope,
        },
        raw_reference_header=ref_image.raw_headers,
    )
```

- [ ] **Step 4: Ensure all imports are present at top of file**

The top of `backend/app/api/targets.py` should have:
```python
import uuid
import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func, cast, Float
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Target, Image
from app.schemas import TargetSearchResult
from app.schemas.target import (
    TargetAggregationResponse, TargetAggregation, SessionSummary,
    AggregateStats, EquipmentResponse, SessionDetailResponse,
)
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/targets.py
git commit -m "feat: add target aggregation, equipment, and session detail endpoints"
```

---

## Task 5: Stats API Endpoint

**Files:**
- Create: `backend/app/api/stats.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Create stats endpoint**

Create `backend/app/api/stats.py`:

```python
import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import Image, Target
from app.schemas.stats import (
    StatsResponse, OverviewStats, EquipmentStats, EquipmentItem,
    TimelineEntry, TopTarget, DataQualityStats, HfrBucket,
    StorageStats, IngestEntry,
)

router = APIRouter(prefix="/stats", tags=["stats"])


def _dir_size(path: str) -> int:
    """Calculate total size of files in a directory."""
    total = 0
    p = Path(path)
    if p.exists():
        for f in p.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    return total


@router.get("", response_model=StatsResponse)
async def get_stats(session: AsyncSession = Depends(get_session)):
    """Return comprehensive database analytics for the admin page."""

    # Overview
    overview_q = select(
        func.coalesce(func.sum(Image.exposure_time), 0),
        func.count(func.distinct(Image.resolved_target_id)),
        func.count(Image.id),
    ).where(Image.image_type == "LIGHT")
    ov = await session.execute(overview_q)
    total_seconds, target_count, total_frames = ov.one()

    fits_bytes = _dir_size(settings.fits_data_path)
    thumb_bytes = _dir_size(settings.thumbnails_path)

    overview = OverviewStats(
        total_integration_seconds=float(total_seconds),
        target_count=target_count,
        total_frames=total_frames,
        disk_usage_bytes=fits_bytes + thumb_bytes,
    )

    # Equipment
    cam_q = select(Image.camera, func.count(Image.id)).where(
        Image.camera.isnot(None)
    ).group_by(Image.camera).order_by(func.count(Image.id).desc())
    cam_result = await session.execute(cam_q)
    cameras = [EquipmentItem(name=r[0], frame_count=r[1]) for r in cam_result.all()]

    tel_q = select(Image.telescope, func.count(Image.id)).where(
        Image.telescope.isnot(None)
    ).group_by(Image.telescope).order_by(func.count(Image.id).desc())
    tel_result = await session.execute(tel_q)
    telescopes = [EquipmentItem(name=r[0], frame_count=r[1]) for r in tel_result.all()]

    equipment = EquipmentStats(cameras=cameras, telescopes=telescopes)

    # Filter usage (total seconds per optical filter)
    filter_q = select(
        Image.filter_used, func.coalesce(func.sum(Image.exposure_time), 0)
    ).where(
        Image.filter_used.isnot(None), Image.image_type == "LIGHT"
    ).group_by(Image.filter_used)
    filter_result = await session.execute(filter_q)
    filter_usage = {r[0]: float(r[1]) for r in filter_result.all()}

    # Timeline (monthly integration)
    timeline_q = select(
        func.to_char(Image.capture_date, 'YYYY-MM'),
        func.coalesce(func.sum(Image.exposure_time), 0),
    ).where(
        Image.capture_date.isnot(None), Image.image_type == "LIGHT"
    ).group_by(
        func.to_char(Image.capture_date, 'YYYY-MM')
    ).order_by(func.to_char(Image.capture_date, 'YYYY-MM'))
    timeline_result = await session.execute(timeline_q)
    timeline = [TimelineEntry(month=r[0], integration_seconds=float(r[1])) for r in timeline_result.all()]

    # Top targets
    top_q = select(
        Target.primary_name, func.coalesce(func.sum(Image.exposure_time), 0)
    ).join(Target, Image.resolved_target_id == Target.id).where(
        Image.image_type == "LIGHT"
    ).group_by(Target.primary_name).order_by(
        func.sum(Image.exposure_time).desc()
    ).limit(20)
    top_result = await session.execute(top_q)
    top_targets = [TopTarget(name=r[0], integration_seconds=float(r[1])) for r in top_result.all()]

    # Data quality
    quality_q = select(
        func.avg(Image.median_hfr),
        func.avg(Image.eccentricity),
        func.min(Image.median_hfr),
    ).where(Image.image_type == "LIGHT")
    quality_result = await session.execute(quality_q)
    avg_hfr, avg_ecc, best_hfr = quality_result.one()

    # HFR distribution buckets
    hfr_buckets = []
    bucket_ranges = [(0, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 2.5), (2.5, 3.0), (3.0, 4.0), (4.0, 5.0), (5.0, 100)]
    for low, high in bucket_ranges:
        bucket_q = select(func.count(Image.id)).where(
            Image.median_hfr >= low, Image.median_hfr < high, Image.image_type == "LIGHT"
        )
        br = await session.execute(bucket_q)
        count = br.scalar_one()
        if count > 0:
            label = f"{low:.1f}-{high:.1f}" if high < 100 else f"{low:.1f}+"
            hfr_buckets.append(HfrBucket(bucket=label, count=count))

    data_quality = DataQualityStats(
        avg_hfr=round(float(avg_hfr), 2) if avg_hfr else None,
        avg_eccentricity=round(float(avg_ecc), 2) if avg_ecc else None,
        best_hfr=round(float(best_hfr), 2) if best_hfr else None,
        hfr_distribution=hfr_buckets,
    )

    # Storage
    # DB size estimate
    db_size_q = select(func.pg_database_size(func.current_database()))
    try:
        db_result = await session.execute(db_size_q)
        db_bytes = db_result.scalar_one()
    except Exception:
        db_bytes = 0

    storage = StorageStats(
        fits_bytes=fits_bytes,
        thumbnail_bytes=thumb_bytes,
        database_bytes=db_bytes,
    )

    # Ingest history (images grouped by date they were added — approximate via capture_date)
    ingest_q = select(
        func.date(Image.capture_date), func.count(Image.id)
    ).where(
        Image.capture_date.isnot(None)
    ).group_by(
        func.date(Image.capture_date)
    ).order_by(func.date(Image.capture_date).desc()).limit(30)
    ingest_result = await session.execute(ingest_q)
    ingest_history = [
        IngestEntry(date=str(r[0]), files_added=r[1]) for r in ingest_result.all()
    ]

    return StatsResponse(
        overview=overview,
        equipment=equipment,
        filter_usage=filter_usage,
        timeline=timeline,
        top_targets=top_targets,
        data_quality=data_quality,
        storage=storage,
        ingest_history=ingest_history,
    )
```

- [ ] **Step 2: Register stats router**

In `backend/app/api/router.py`, add:
```python
from .stats import router as stats_router
api_router.include_router(stats_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/stats.py backend/app/api/router.py
git commit -m "feat: add stats endpoint for admin analytics dashboard"
```

---

## Task 6: Remove Old Image Endpoints

**Files:**
- Remove: `backend/app/api/images.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Remove images router from router.py**

Remove the import and `include_router` for images_router from `backend/app/api/router.py`.

- [ ] **Step 2: Delete images.py**

```bash
rm backend/app/api/images.py
```

- [ ] **Step 3: Commit**

```bash
git add -A backend/app/api/
git commit -m "refactor: remove old image list endpoints, replaced by target aggregation"
```

---

## Task 7: Frontend Foundation — Types, API Client, Tailwind Config

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install @solidjs/router**

```bash
cd frontend && npm install @solidjs/router
```

- [ ] **Step 2: Rewrite types**

Rewrite `frontend/src/types/index.ts`:

```typescript
// === Target Aggregation ===

export interface SessionSummary {
  session_date: string;
  integration_seconds: number;
  frame_count: number;
  filters_used: string[];
}

export interface TargetAggregation {
  target_id: string;
  primary_name: string;
  aliases: string[];
  total_integration_seconds: number;
  total_frames: number;
  filter_distribution: Record<string, number>;
  equipment: string[];
  sessions: SessionSummary[];
}

export interface AggregateStats {
  total_integration_seconds: number;
  target_count: number;
  total_frames: number;
  disk_usage_bytes: number;
}

export interface TargetAggregationResponse {
  targets: TargetAggregation[];
  aggregates: AggregateStats;
}

// === Session Detail ===

export interface SessionDetail {
  target_name: string;
  session_date: string;
  thumbnail_url: string | null;
  frame_count: number;
  integration_seconds: number;
  median_hfr: number | null;
  median_eccentricity: number | null;
  filters_used: Record<string, number>;
  equipment: { camera: string | null; telescope: string | null };
  raw_reference_header: Record<string, unknown> | null;
}

// === Equipment ===

export interface EquipmentList {
  cameras: string[];
  telescopes: string[];
}

// === Filters ===

export interface ActiveFilters {
  searchQuery: string;
  camera: string | null;
  telescope: string | null;
  opticalFilters: string[];
  dateRange: { start: string | null; end: string | null };
  fitsQueries: { key: string; operator: string; value: string }[];
}

// === Scan (unchanged) ===

export interface ScanResult {
  status: string;
  new_files_queued: number;
  already_known: number;
  state?: string;
  total?: number;
  completed?: number;
  failed?: number;
}

export interface ScanStatus {
  state: "idle" | "scanning" | "ingesting" | "complete";
  total: number;
  completed: number;
  failed: number;
  started_at: number | null;
  completed_at: number | null;
}

// === Search ===

export interface TargetSearchResult {
  id: string;
  primary_name: string;
  object_type: string | null;
}

// === Stats (Admin) ===

export interface EquipmentItem {
  name: string;
  frame_count: number;
}

export interface TimelineEntry {
  month: string;
  integration_seconds: number;
}

export interface TopTarget {
  name: string;
  integration_seconds: number;
}

export interface HfrBucket {
  bucket: string;
  count: number;
}

export interface StatsResponse {
  overview: AggregateStats;
  equipment: {
    cameras: EquipmentItem[];
    telescopes: EquipmentItem[];
  };
  filter_usage: Record<string, number>;
  timeline: TimelineEntry[];
  top_targets: TopTarget[];
  data_quality: {
    avg_hfr: number | null;
    avg_eccentricity: number | null;
    best_hfr: number | null;
    hfr_distribution: HfrBucket[];
  };
  storage: {
    fits_bytes: number;
    thumbnail_bytes: number;
    database_bytes: number;
  };
  ingest_history: { date: string; files_added: number }[];
}
```

- [ ] **Step 3: Rewrite API client**

Rewrite `frontend/src/api/client.ts`:

```typescript
import type {
  TargetAggregationResponse,
  SessionDetail,
  EquipmentList,
  TargetSearchResult,
  ScanResult,
  ScanStatus,
  ActiveFilters,
  StatsResponse,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

function buildTargetQuery(filters: ActiveFilters): string {
  const params = new URLSearchParams();
  if (filters.searchQuery) params.set("search", filters.searchQuery);
  if (filters.camera) params.set("camera", filters.camera);
  if (filters.telescope) params.set("telescope", filters.telescope);
  if (filters.opticalFilters.length > 0) {
    params.set("filters", filters.opticalFilters.join(","));
  }
  if (filters.dateRange.start) params.set("date_from", filters.dateRange.start);
  if (filters.dateRange.end) params.set("date_to", filters.dateRange.end);
  for (const fq of filters.fitsQueries) {
    params.append("fits_key", fq.key);
    params.append("fits_op", fq.operator);
    params.append("fits_val", fq.value);
  }
  return params.toString();
}

export const api = {
  getTargets: (filters: ActiveFilters) =>
    fetchJson<TargetAggregationResponse>(`/targets?${buildTargetQuery(filters)}`),

  getSessionDetail: (targetId: string, date: string) =>
    fetchJson<SessionDetail>(`/targets/${targetId}/sessions/${date}`),

  getEquipment: () =>
    fetchJson<EquipmentList>("/targets/equipment"),

  searchTargets: (query: string) =>
    fetchJson<TargetSearchResult[]>(`/targets/search?q=${encodeURIComponent(query)}`),

  getStats: () =>
    fetchJson<StatsResponse>("/stats"),

  triggerScan: () =>
    fetchJson<ScanResult>("/scan", { method: "POST" }),

  getScanStatus: () =>
    fetchJson<ScanStatus>("/scan/status"),

  thumbnailUrl: (path: string) => {
    const base = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:8000";
    const filename = path.split("/").pop();
    return `${base}/thumbnails/${filename}`;
  },
};
```

- [ ] **Step 4: Update Tailwind config with filter colors**

Update `frontend/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        astro: {
          dark: "#0a0a1a",
          panel: "#12122a",
          accent: "#4f7cff",
          muted: "#6b7280",
        },
        filter: {
          ha: "#c44040",
          oiii: "#3a8fd4",
          sii: "#d4a43a",
          l: "#e0e0e0",
          r: "#e05050",
          g: "#50b050",
          b: "#5070e0",
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Update index.css with filter color CSS variables**

Update `frontend/src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-astro-dark: #0a0a1a;
  --color-astro-panel: #12122a;
  --color-astro-accent: #4f7cff;
  --color-astro-muted: #6b7280;
  --color-filter-ha: #c44040;
  --color-filter-oiii: #3a8fd4;
  --color-filter-sii: #d4a43a;
  --color-filter-l: #e0e0e0;
  --color-filter-r: #e05050;
  --color-filter-g: #50b050;
  --color-filter-b: #5070e0;
}

body {
  @apply bg-astro-dark text-white;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: update frontend foundation — types, API client, tailwind config, add router dep"
```

---

## Task 8: Frontend Stores

**Files:**
- Modify: `frontend/src/store/catalog.ts`
- Create: `frontend/src/store/stats.ts`

- [ ] **Step 1: Rewrite catalog store for target aggregation**

Rewrite `frontend/src/store/catalog.ts`:

```typescript
import { createSignal, createResource } from "solid-js";
import { api } from "../api/client";
import type { ActiveFilters, TargetAggregationResponse, SessionDetail, EquipmentList } from "../types";

const defaultFilters: ActiveFilters = {
  searchQuery: "",
  camera: null,
  telescope: null,
  opticalFilters: [],
  dateRange: { start: null, end: null },
  fitsQueries: [],
};

const [filters, setFilters] = createSignal<ActiveFilters>({ ...defaultFilters });
const [targetData, { refetch: refetchTargets }] = createResource(filters, (f) => api.getTargets(f));
const [equipment] = createResource(() => api.getEquipment());

const [expandedTargets, setExpandedTargets] = createSignal<Set<string>>(new Set());
const [drawerContext, setDrawerContext] = createSignal<{ targetId: string; date: string } | null>(null);
const [sessionDetail] = createResource(drawerContext, (ctx) =>
  ctx ? api.getSessionDetail(ctx.targetId, ctx.date) : undefined
);

export function useCatalog() {
  return {
    filters,
    setFilters,
    targetData,
    equipment,
    expandedTargets,
    drawerContext,
    sessionDetail,
    refetchTargets,

    updateFilter: <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },

    toggleOpticalFilter: (f: string) => {
      setFilters((prev) => {
        const current = prev.opticalFilters;
        const next = current.includes(f)
          ? current.filter((x) => x !== f)
          : [...current, f];
        return { ...prev, opticalFilters: next };
      });
    },

    toggleExpanded: (targetId: string) => {
      setExpandedTargets((prev) => {
        const next = new Set(prev);
        if (next.has(targetId)) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
    },

    openDrawer: (targetId: string, date: string) => {
      setDrawerContext({ targetId, date });
    },

    closeDrawer: () => {
      setDrawerContext(null);
    },

    resetFilters: () => setFilters({ ...defaultFilters }),
  };
}
```

- [ ] **Step 2: Create stats store**

Create `frontend/src/store/stats.ts`:

```typescript
import { createResource } from "solid-js";
import { api } from "../api/client";

const [stats, { refetch: refetchStats }] = createResource(() => api.getStats());

export function useStats() {
  return { stats, refetchStats };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/
git commit -m "feat: rewrite catalog store for target aggregation, add stats store"
```

---

## Task 9: Frontend Routing & Layout — App, NavBar, Index

**Files:**
- Modify: `frontend/src/index.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/NavBar.tsx`

- [ ] **Step 1: Update index.tsx with Router**

```typescript
/* @refresh reload */
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
render(() => <Router root={App} />, root!);
```

Note: with `@solidjs/router` v0.15+, the pattern is `<Router root={App}>` where `App` receives `props.children` for the routed content. Check the installed version and adjust if needed. If using older API, use `<Router><Route path="/" component={DashboardPage} /><Route path="/admin" component={AdminPage} /></Router>` inside App.

- [ ] **Step 2: Rewrite App.tsx as router root**

```typescript
import { type Component, type ParentProps } from "solid-js";
import { Route } from "@solidjs/router";
import NavBar from "./components/NavBar";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";

const App: Component<ParentProps> = (props) => {
  return (
    <div class="min-h-screen bg-astro-dark">
      <NavBar />
      {props.children}
    </div>
  );
};

// Note: If using @solidjs/router v0.14+, routes are defined in index.tsx
// Adjust based on actual installed version. The App component is the layout wrapper.

export default App;
```

- [ ] **Step 3: Create NavBar**

Create `frontend/src/components/NavBar.tsx`:

```typescript
import { Component } from "solid-js";
import { A } from "@solidjs/router";

const NavBar: Component = () => {
  return (
    <header class="border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      <h1 class="text-white font-bold text-lg whitespace-nowrap">AstroLog</h1>
      <nav class="flex gap-4">
        <A
          href="/"
          class="text-sm text-astro-muted hover:text-white transition-colors"
          activeClass="text-white font-medium"
          end
        >
          Dashboard
        </A>
        <A
          href="/admin"
          class="text-sm text-astro-muted hover:text-white transition-colors"
          activeClass="text-white font-medium"
        >
          Admin & Stats
        </A>
      </nav>
    </header>
  );
};

export default NavBar;
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.tsx frontend/src/App.tsx frontend/src/components/NavBar.tsx
git commit -m "feat: add client-side routing with NavBar, Dashboard and Admin routes"
```

---

## Task 10: Dashboard Sidebar Components

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/SearchBar.tsx`
- Create: `frontend/src/components/DateRangePicker.tsx`
- Create: `frontend/src/components/FilterToggles.tsx`
- Create: `frontend/src/components/HardwareSelects.tsx`
- Create: `frontend/src/components/FitsQueryBuilder.tsx`

- [ ] **Step 1: Create Sidebar container**

```typescript
import { Component } from "solid-js";
import SearchBar from "./SearchBar";
import DateRangePicker from "./DateRangePicker";
import FilterToggles from "./FilterToggles";
import HardwareSelects from "./HardwareSelects";
import FitsQueryBuilder from "./FitsQueryBuilder";

const Sidebar: Component = () => {
  return (
    <aside class="w-72 min-h-[calc(100vh-57px)] border-r border-gray-800 p-4 space-y-4 overflow-y-auto">
      <SearchBar />
      <DateRangePicker />
      <FilterToggles />
      <HardwareSelects />
      <FitsQueryBuilder />
    </aside>
  );
};

export default Sidebar;
```

- [ ] **Step 2: Adapt SearchBar for new store**

Rewrite `frontend/src/components/SearchBar.tsx`:

```typescript
import { Component, createSignal, For, Show } from "solid-js";
import { api } from "../api/client";
import { useCatalog } from "../store/catalog";
import type { TargetSearchResult } from "../types";

const SearchBar: Component = () => {
  const { updateFilter } = useCatalog();
  const [query, setQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<TargetSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  let debounceTimer: ReturnType<typeof setTimeout>;

  const onInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceTimer);
    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      updateFilter("searchQuery", value);
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await api.searchTargets(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
      }
      updateFilter("searchQuery", value);
    }, 300);
  };

  const selectTarget = (target: TargetSearchResult) => {
    setQuery(target.primary_name);
    setShowSuggestions(false);
    updateFilter("searchQuery", target.primary_name);
  };

  return (
    <div class="relative">
      <label class="text-xs text-astro-muted mb-1 block">Search Targets</label>
      <input
        type="text"
        value={query()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onFocus={() => suggestions().length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="M31, NGC 7000..."
        class="w-full px-3 py-2 bg-astro-dark border border-gray-700 rounded text-sm text-white placeholder-astro-muted focus:outline-none focus:ring-1 focus:ring-astro-accent"
      />
      <Show when={showSuggestions()}>
        <div class="absolute z-50 w-full mt-1 bg-astro-panel border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
          <For each={suggestions()}>
            {(target) => (
              <button
                type="button"
                class="w-full text-left px-3 py-2 hover:bg-astro-accent/20 text-white text-sm"
                onMouseDown={() => selectTarget(target)}
              >
                <span class="font-medium">{target.primary_name}</span>
                <Show when={target.object_type}>
                  <span class="text-astro-muted ml-2">({target.object_type})</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default SearchBar;
```

- [ ] **Step 3: Create DateRangePicker**

```typescript
import { Component } from "solid-js";
import { useCatalog } from "../store/catalog";

const DateRangePicker: Component = () => {
  const { filters, updateFilter } = useCatalog();

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Date Range</label>
      <div class="flex gap-2">
        <input
          type="date"
          value={filters().dateRange.start || ""}
          onInput={(e) =>
            updateFilter("dateRange", { ...filters().dateRange, start: e.currentTarget.value || null })
          }
          class="flex-1 px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <input
          type="date"
          value={filters().dateRange.end || ""}
          onInput={(e) =>
            updateFilter("dateRange", { ...filters().dateRange, end: e.currentTarget.value || null })
          }
          class="flex-1 px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
      </div>
    </div>
  );
};

export default DateRangePicker;
```

- [ ] **Step 4: Create FilterToggles**

```typescript
import { Component, For } from "solid-js";
import { useCatalog } from "../store/catalog";

const FILTER_COLORS: Record<string, string> = {
  Ha: "bg-filter-ha",
  OIII: "bg-filter-oiii",
  SII: "bg-filter-sii",
  L: "bg-filter-l text-gray-900",
  R: "bg-filter-r",
  G: "bg-filter-g",
  B: "bg-filter-b",
};

const BROADBAND = ["L", "R", "G", "B"];
const NARROWBAND = ["Ha", "OIII", "SII"];

const FilterToggles: Component = () => {
  const { filters, toggleOpticalFilter } = useCatalog();

  const isActive = (f: string) => filters().opticalFilters.includes(f);

  const renderPill = (name: string) => {
    const active = isActive(name);
    const colorClass = FILTER_COLORS[name] || "bg-gray-600";
    return (
      <button
        onClick={() => toggleOpticalFilter(name)}
        class={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          active ? `${colorClass} text-white ring-2 ring-white/30` : "bg-gray-700/50 text-astro-muted"
        }`}
      >
        {name}
      </button>
    );
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Optical Filters</label>
      <div class="space-y-1.5">
        <div class="flex gap-1.5 flex-wrap">
          <span class="text-[10px] text-astro-muted w-full">Broadband</span>
          <For each={BROADBAND}>{(f) => renderPill(f)}</For>
        </div>
        <div class="flex gap-1.5 flex-wrap">
          <span class="text-[10px] text-astro-muted w-full">Narrowband</span>
          <For each={NARROWBAND}>{(f) => renderPill(f)}</For>
        </div>
      </div>
    </div>
  );
};

export default FilterToggles;
```

- [ ] **Step 5: Create HardwareSelects**

```typescript
import { Component, Show, For } from "solid-js";
import { useCatalog } from "../store/catalog";

const HardwareSelects: Component = () => {
  const { filters, updateFilter, equipment } = useCatalog();

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Equipment</label>
      <Show when={equipment()} fallback={<p class="text-xs text-astro-muted">Loading...</p>}>
        {(eq) => (
          <>
            <select
              value={filters().camera || ""}
              onChange={(e) => updateFilter("camera", e.currentTarget.value || null)}
              class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
            >
              <option value="">All Cameras</option>
              <For each={eq().cameras}>{(c) => <option value={c}>{c}</option>}</For>
            </select>
            <select
              value={filters().telescope || ""}
              onChange={(e) => updateFilter("telescope", e.currentTarget.value || null)}
              class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
            >
              <option value="">All Telescopes</option>
              <For each={eq().telescopes}>{(t) => <option value={t}>{t}</option>}</For>
            </select>
          </>
        )}
      </Show>
    </div>
  );
};

export default HardwareSelects;
```

- [ ] **Step 6: Create FitsQueryBuilder**

```typescript
import { Component, For, createSignal } from "solid-js";
import { useCatalog } from "../store/catalog";

const OPERATORS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
];

const FitsQueryBuilder: Component = () => {
  const { filters, setFilters } = useCatalog();
  const [newKey, setNewKey] = createSignal("");
  const [newOp, setNewOp] = createSignal("eq");
  const [newVal, setNewVal] = createSignal("");

  const addRow = () => {
    const key = newKey().trim();
    const val = newVal().trim();
    if (!key || !val) return;
    setFilters((prev) => ({
      ...prev,
      fitsQueries: [...prev.fitsQueries, { key, operator: newOp(), value: val }],
    }));
    setNewKey("");
    setNewVal("");
  };

  const removeRow = (index: number) => {
    setFilters((prev) => ({
      ...prev,
      fitsQueries: prev.fitsQueries.filter((_, i) => i !== index),
    }));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRow();
    }
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">FITS Header Query</label>

      {/* Existing rows */}
      <For each={filters().fitsQueries}>
        {(row, i) => (
          <div class="flex items-center gap-1 text-xs">
            <span class="text-white font-mono flex-1 truncate">{row.key} {row.operator} {row.value}</span>
            <button onClick={() => removeRow(i())} class="text-red-400 hover:text-red-300 px-1">&times;</button>
          </div>
        )}
      </For>

      {/* New row inputs */}
      <div class="flex gap-1">
        <input
          type="text"
          value={newKey()}
          onInput={(e) => setNewKey(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Key"
          class="w-20 px-1.5 py-1 bg-astro-dark border border-gray-700 rounded text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <select
          value={newOp()}
          onChange={(e) => setNewOp(e.currentTarget.value)}
          class="px-1 py-1 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none"
        >
          <For each={OPERATORS}>{(op) => <option value={op.value}>{op.label}</option>}</For>
        </select>
        <input
          type="text"
          value={newVal()}
          onInput={(e) => setNewVal(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Value"
          class="flex-1 px-1.5 py-1 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <button onClick={addRow} class="px-2 py-1 bg-astro-accent text-white rounded text-xs hover:bg-astro-accent/80">+</button>
      </div>
    </div>
  );
};

export default FitsQueryBuilder;
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/SearchBar.tsx frontend/src/components/DateRangePicker.tsx frontend/src/components/FilterToggles.tsx frontend/src/components/HardwareSelects.tsx frontend/src/components/FitsQueryBuilder.tsx
git commit -m "feat: add sidebar filter components — search, date range, filter toggles, hardware selects, FITS query builder"
```

---

## Task 11: Dashboard Main Content — CommandBar, TargetFeed, TargetCard

**Files:**
- Create: `frontend/src/components/CommandBar.tsx`
- Create: `frontend/src/components/AggregateWidgets.tsx`
- Create: `frontend/src/components/TargetFeed.tsx`
- Create: `frontend/src/components/TargetCard.tsx`
- Create: `frontend/src/components/FilterBadges.tsx`
- Create: `frontend/src/components/SessionTable.tsx`

- [ ] **Step 1: Create AggregateWidgets**

```typescript
import { Component } from "solid-js";
import type { AggregateStats } from "../types";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

function formatBytes(bytes: number): string {
  if (bytes < 1e9) return (bytes / 1e6).toFixed(0) + " MB";
  if (bytes < 1e12) return (bytes / 1e9).toFixed(1) + " GB";
  return (bytes / 1e12).toFixed(2) + " TB";
}

const AggregateWidgets: Component<{ aggregates: AggregateStats }> = (props) => {
  const widgets = () => [
    { label: "Integration", value: formatHours(props.aggregates.total_integration_seconds) },
    { label: "Targets", value: String(props.aggregates.target_count) },
    { label: "Frames", value: props.aggregates.total_frames.toLocaleString() },
    { label: "Disk", value: formatBytes(props.aggregates.disk_usage_bytes) },
  ];

  return (
    <div class="flex gap-4">
      {widgets().map((w) => (
        <div class="bg-astro-panel rounded px-3 py-2">
          <div class="text-xs text-astro-muted">{w.label}</div>
          <div class="text-white font-semibold text-sm">{w.value}</div>
        </div>
      ))}
    </div>
  );
};

export default AggregateWidgets;
```

- [ ] **Step 2: Create CommandBar**

```typescript
import { Component, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import AggregateWidgets from "./AggregateWidgets";

const CommandBar: Component = () => {
  const { targetData, resetFilters } = useCatalog();

  return (
    <div class="sticky top-0 z-10 bg-astro-dark/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
      <Show when={targetData()}>
        {(data) => <AggregateWidgets aggregates={data().aggregates} />}
      </Show>
      <button
        onClick={resetFilters}
        class="text-xs text-astro-muted hover:text-white transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
};

export default CommandBar;
```

- [ ] **Step 3: Create FilterBadges**

```typescript
import { Component, For } from "solid-js";

const COLOR_MAP: Record<string, string> = {
  Ha: "bg-filter-ha",
  OIII: "bg-filter-oiii",
  SII: "bg-filter-sii",
  L: "bg-filter-l text-gray-900",
  R: "bg-filter-r",
  G: "bg-filter-g",
  B: "bg-filter-b",
};

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const FilterBadges: Component<{ distribution: Record<string, number> }> = (props) => {
  const entries = () =>
    Object.entries(props.distribution).sort(([, a], [, b]) => b - a);

  return (
    <div class="flex gap-1.5 flex-wrap">
      <For each={entries()}>
        {([name, seconds]) => (
          <span class={`px-2 py-0.5 rounded-full text-[11px] font-medium ${COLOR_MAP[name] || "bg-gray-600"} text-white`}>
            {name}&middot;{formatHours(seconds)}
          </span>
        )}
      </For>
    </div>
  );
};

export default FilterBadges;
```

- [ ] **Step 4: Create SessionTable**

```typescript
import { Component, For } from "solid-js";
import type { SessionSummary } from "../types";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const SessionTable: Component<{
  sessions: SessionSummary[];
  onDeepDive: (date: string) => void;
}> = (props) => {
  return (
    <div class="border-t border-gray-800 mt-2">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-astro-muted border-b border-gray-800">
            <th class="text-left py-1.5 px-2 font-normal">Date</th>
            <th class="text-right py-1.5 px-2 font-normal">Frames</th>
            <th class="text-right py-1.5 px-2 font-normal">Integration</th>
            <th class="text-left py-1.5 px-2 font-normal">Filters</th>
            <th class="py-1.5 px-2"></th>
          </tr>
        </thead>
        <tbody>
          <For each={props.sessions}>
            {(session) => (
              <tr class="border-b border-gray-800/50 hover:bg-astro-panel/50">
                <td class="py-1.5 px-2 text-white">{session.session_date}</td>
                <td class="py-1.5 px-2 text-right text-white">{session.frame_count}</td>
                <td class="py-1.5 px-2 text-right text-white">{formatHours(session.integration_seconds)}</td>
                <td class="py-1.5 px-2 text-astro-muted">{session.filters_used.join(", ")}</td>
                <td class="py-1.5 px-2 text-right">
                  <button
                    onClick={() => props.onDeepDive(session.session_date)}
                    class="text-astro-accent hover:underline text-[11px]"
                  >
                    Deep Dive
                  </button>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};

export default SessionTable;
```

- [ ] **Step 5: Create TargetCard**

```typescript
import { Component, Show } from "solid-js";
import type { TargetAggregation } from "../types";
import FilterBadges from "./FilterBadges";
import SessionTable from "./SessionTable";
import { useCatalog } from "../store/catalog";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const TargetCard: Component<{ target: TargetAggregation }> = (props) => {
  const { expandedTargets, toggleExpanded, openDrawer } = useCatalog();
  const isOpen = () => expandedTargets().has(props.target.target_id);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <div
        class="flex items-center justify-between cursor-pointer"
        onClick={() => toggleExpanded(props.target.target_id)}
      >
        <div>
          <h3 class="text-white font-medium">{props.target.primary_name}</h3>
          <Show when={props.target.aliases.length > 0}>
            <p class="text-xs text-astro-muted">{props.target.aliases.join(", ")}</p>
          </Show>
        </div>
        <div class="text-right text-sm">
          <span class="text-white font-semibold">{formatHours(props.target.total_integration_seconds)}</span>
          <span class="text-astro-muted ml-2">{props.target.total_frames} frames</span>
        </div>
      </div>

      <FilterBadges distribution={props.target.filter_distribution} />

      <Show when={props.target.equipment.length > 0}>
        <div class="text-xs text-astro-muted">
          {props.target.equipment.join(" / ")}
        </div>
      </Show>

      <Show when={isOpen()}>
        <SessionTable
          sessions={props.target.sessions}
          onDeepDive={(date) => openDrawer(props.target.target_id, date)}
        />
      </Show>
    </div>
  );
};

export default TargetCard;
```

- [ ] **Step 6: Create TargetFeed**

```typescript
import { Component, For, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import TargetCard from "./TargetCard";

const TargetFeed: Component = () => {
  const { targetData } = useCatalog();

  return (
    <div class="space-y-3 p-4">
      <Show when={targetData.loading}>
        <div class="text-center text-astro-muted py-8">Loading targets...</div>
      </Show>
      <Show when={targetData.error}>
        <div class="text-center text-red-400 py-8">
          Failed to load targets: {String(targetData.error)}
        </div>
      </Show>
      <Show when={targetData()}>
        {(data) => (
          <Show
            when={data().targets.length > 0}
            fallback={<div class="text-center text-astro-muted py-8">No targets match your filters</div>}
          >
            <For each={data().targets}>
              {(target) => <TargetCard target={target} />}
            </For>
          </Show>
        )}
      </Show>
    </div>
  );
};

export default TargetFeed;
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CommandBar.tsx frontend/src/components/AggregateWidgets.tsx frontend/src/components/TargetFeed.tsx frontend/src/components/TargetCard.tsx frontend/src/components/FilterBadges.tsx frontend/src/components/SessionTable.tsx
git commit -m "feat: add target feed components — command bar, target cards, filter badges, session table"
```

---

## Task 12: Detail Drawer

**Files:**
- Create: `frontend/src/components/DetailDrawer.tsx`
- Create: `frontend/src/components/ReferenceThumbnail.tsx`
- Create: `frontend/src/components/QualityMetrics.tsx`
- Create: `frontend/src/components/RawHeaderAccordion.tsx`

- [ ] **Step 1: Create ReferenceThumbnail**

```typescript
import { Component, Show } from "solid-js";
import { api } from "../api/client";

const ReferenceThumbnail: Component<{ url: string | null }> = (props) => {
  return (
    <Show when={props.url} fallback={
      <div class="w-full h-48 bg-astro-dark rounded flex items-center justify-center text-astro-muted text-sm">
        No thumbnail
      </div>
    }>
      {(url) => (
        <img
          src={api.thumbnailUrl(url())}
          alt="Reference frame"
          class="w-full rounded object-contain max-h-64 bg-black"
          loading="lazy"
        />
      )}
    </Show>
  );
};

export default ReferenceThumbnail;
```

- [ ] **Step 2: Create QualityMetrics**

```typescript
import { Component, Show } from "solid-js";

const QualityMetrics: Component<{
  hfr: number | null;
  eccentricity: number | null;
  frameCount: number;
  integrationSeconds: number;
}> = (props) => {
  return (
    <div class="grid grid-cols-2 gap-3">
      <MetricBox label="Frames" value={String(props.frameCount)} />
      <MetricBox label="Integration" value={`${(props.integrationSeconds / 3600).toFixed(1)}h`} />
      <Show when={props.hfr != null}>
        <MetricBox label="Median HFR" value={props.hfr!.toFixed(2)} />
      </Show>
      <Show when={props.eccentricity != null}>
        <MetricBox label="Eccentricity" value={props.eccentricity!.toFixed(2)} />
      </Show>
    </div>
  );
};

function MetricBox(props: { label: string; value: string }) {
  return (
    <div class="bg-astro-dark rounded p-2">
      <div class="text-[10px] text-astro-muted">{props.label}</div>
      <div class="text-white font-semibold text-sm">{props.value}</div>
    </div>
  );
}

export default QualityMetrics;
```

- [ ] **Step 3: Create RawHeaderAccordion**

```typescript
import { Component, For, Show, createSignal } from "solid-js";

const RawHeaderAccordion: Component<{ headers: Record<string, unknown> | null }> = (props) => {
  const [open, setOpen] = createSignal(false);

  const entries = () => {
    if (!props.headers) return [];
    return Object.entries(props.headers).sort(([a], [b]) => a.localeCompare(b));
  };

  return (
    <div class="border-t border-gray-800 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        class="text-xs text-astro-accent hover:underline w-full text-left"
      >
        {open() ? "Hide FITS Headers" : "Show FITS Headers"} ({entries().length} keys)
      </button>
      <Show when={open()}>
        <div class="mt-2 max-h-64 overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-astro-panel">
              <tr class="text-astro-muted">
                <th class="text-left py-1 px-2 font-normal">Key</th>
                <th class="text-left py-1 px-2 font-normal">Value</th>
              </tr>
            </thead>
            <tbody>
              <For each={entries()}>
                {([key, value]) => (
                  <tr class="border-t border-gray-800/30">
                    <td class="py-1 px-2 text-astro-muted font-mono">{key}</td>
                    <td class="py-1 px-2 text-white font-mono break-all">{String(value)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

export default RawHeaderAccordion;
```

- [ ] **Step 4: Create DetailDrawer**

```typescript
import { Component, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import ReferenceThumbnail from "./ReferenceThumbnail";
import QualityMetrics from "./QualityMetrics";
import RawHeaderAccordion from "./RawHeaderAccordion";

const DetailDrawer: Component = () => {
  const { drawerContext, sessionDetail, closeDrawer } = useCatalog();

  return (
    <Show when={drawerContext()}>
      {/* Backdrop */}
      <div class="fixed inset-0 z-40 bg-black/50" onClick={closeDrawer} />

      {/* Drawer panel */}
      <div class="fixed inset-y-0 right-0 z-50 w-96 bg-astro-panel border-l border-gray-800 overflow-y-auto">
        <div class="p-4 space-y-4">
          {/* Header */}
          <div class="flex justify-between items-center">
            <h2 class="text-white font-semibold">Session Detail</h2>
            <button onClick={closeDrawer} class="text-astro-muted hover:text-white text-xl">&times;</button>
          </div>

          <Show when={sessionDetail.loading}>
            <div class="text-astro-muted text-sm py-4">Loading session data...</div>
          </Show>

          <Show when={sessionDetail.error}>
            <div class="text-red-400 text-sm py-4">Failed to load session detail</div>
          </Show>

          <Show when={sessionDetail()}>
            {(detail) => (
              <>
                <div>
                  <h3 class="text-white font-medium">{detail().target_name}</h3>
                  <p class="text-xs text-astro-muted">{detail().session_date}</p>
                </div>

                <ReferenceThumbnail url={detail().thumbnail_url} />

                <QualityMetrics
                  hfr={detail().median_hfr}
                  eccentricity={detail().median_eccentricity}
                  frameCount={detail().frame_count}
                  integrationSeconds={detail().integration_seconds}
                />

                {/* Filter breakdown */}
                <div class="space-y-1">
                  <h4 class="text-xs text-astro-muted">Filters Used</h4>
                  <div class="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(detail().filters_used).map(([name, count]) => (
                      <div class="flex justify-between bg-astro-dark rounded px-2 py-1">
                        <span class="text-white">{name}</span>
                        <span class="text-astro-muted">{count} frames</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Equipment */}
                <div class="space-y-1">
                  <h4 class="text-xs text-astro-muted">Equipment</h4>
                  <div class="text-xs text-white">
                    <Show when={detail().equipment.camera}>
                      <div>Camera: {detail().equipment.camera}</div>
                    </Show>
                    <Show when={detail().equipment.telescope}>
                      <div>Telescope: {detail().equipment.telescope}</div>
                    </Show>
                  </div>
                </div>

                <RawHeaderAccordion headers={detail().raw_reference_header} />
              </>
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default DetailDrawer;
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DetailDrawer.tsx frontend/src/components/ReferenceThumbnail.tsx frontend/src/components/QualityMetrics.tsx frontend/src/components/RawHeaderAccordion.tsx
git commit -m "feat: add detail drawer with thumbnail, quality metrics, and FITS header accordion"
```

---

## Task 13: Dashboard Page

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create DashboardPage**

```typescript
import { Component } from "solid-js";
import Sidebar from "../components/Sidebar";
import CommandBar from "../components/CommandBar";
import TargetFeed from "../components/TargetFeed";
import DetailDrawer from "../components/DetailDrawer";

const DashboardPage: Component = () => {
  return (
    <div class="flex">
      <Sidebar />
      <main class="flex-1 min-h-[calc(100vh-57px)]">
        <CommandBar />
        <TargetFeed />
      </main>
      <DetailDrawer />
    </div>
  );
};

export default DashboardPage;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: add DashboardPage assembling sidebar, command bar, target feed, and detail drawer"
```

---

## Task 14: Admin Page Components

**Files:**
- Create: `frontend/src/components/ScanManager.tsx`
- Create: `frontend/src/components/DatabaseOverview.tsx`
- Create: `frontend/src/components/EquipmentInventory.tsx`
- Create: `frontend/src/components/FilterUsageChart.tsx`
- Create: `frontend/src/components/ImagingTimeline.tsx`
- Create: `frontend/src/components/TopTargets.tsx`
- Create: `frontend/src/components/DataQuality.tsx`
- Create: `frontend/src/components/StorageBreakdown.tsx`
- Create: `frontend/src/components/IngestHistory.tsx`

- [ ] **Step 1: Create ScanManager (adapted from ScanDashboard)**

Copy `ScanDashboard.tsx` to `ScanManager.tsx` and remove the `useCatalog()` dependency (the refetch call). The component works standalone on the admin page — when scan completes, the dashboard page will refetch when the user navigates back.

```typescript
import { Component, Show, createSignal, onCleanup } from "solid-js";
import { useScan } from "../store/scan";

const ScanManager: Component = () => {
  const { scanStatus, scanError, isActive, startScan, stopPolling } = useScan();
  const [expanded, setExpanded] = createSignal(false);

  onCleanup(stopPolling);

  const progressPct = () => {
    const s = scanStatus();
    if (s.total === 0) return 0;
    return Math.round(((s.completed + s.failed) / s.total) * 100);
  };

  const elapsed = () => {
    const s = scanStatus();
    if (!s.started_at) return null;
    const end = s.completed_at || Date.now() / 1000;
    return Math.round(end - s.started_at);
  };

  const throughput = () => {
    const el = elapsed();
    if (!el || el === 0 || scanStatus().completed === 0) return null;
    return (scanStatus().completed / el).toFixed(1);
  };

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const stateLabel = () => {
    switch (scanStatus().state) {
      case "scanning": return "Discovering files...";
      case "ingesting": return "Ingesting";
      case "complete": return "Complete";
      default: return "Ready";
    }
  };

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium">Scan & Ingest</h3>
        <button
          onClick={() => startScan()}
          disabled={isActive()}
          class="px-4 py-1.5 bg-astro-accent text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-astro-accent/80 transition-colors"
        >
          {isActive() ? "Scanning..." : "Scan Directory"}
        </button>
      </div>

      <Show when={scanError()}>
        <p class="text-xs text-red-400">{scanError()}</p>
      </Show>

      <Show when={isActive()}>
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-astro-muted">
            <span>{stateLabel()}</span>
            <span>{scanStatus().completed + scanStatus().failed} / {scanStatus().total}</span>
          </div>
          <div class="w-full bg-astro-dark rounded-full h-2">
            <div class="bg-astro-accent h-2 rounded-full transition-all" style={{ width: `${progressPct()}%` }} />
          </div>
        </div>
      </Show>

      <Show when={!isActive() && scanStatus().state === "complete"}>
        <div class="flex justify-between items-center text-xs">
          <span class="text-green-400">Complete</span>
          <span class="text-astro-muted">{scanStatus().completed} ingested</span>
        </div>
      </Show>

      <Show when={scanStatus().state !== "idle"}>
        <button onClick={() => setExpanded((v) => !v)} class="text-xs text-astro-accent hover:underline w-full text-left">
          {expanded() ? "Hide details" : "Show details"}
        </button>
      </Show>

      <Show when={expanded() && scanStatus().state !== "idle"}>
        <div class="border-t border-gray-700 pt-3 space-y-2 text-xs">
          <div class="grid grid-cols-2 gap-y-1.5 gap-x-4">
            <span class="text-astro-muted">Status</span><span class="text-white">{stateLabel()}</span>
            <span class="text-astro-muted">Total</span><span class="text-white">{scanStatus().total}</span>
            <span class="text-astro-muted">Completed</span><span class="text-green-400">{scanStatus().completed}</span>
            <span class="text-astro-muted">Failed</span><span class={scanStatus().failed > 0 ? "text-red-400" : "text-astro-muted"}>{scanStatus().failed}</span>
            <Show when={elapsed() != null}>
              <span class="text-astro-muted">Elapsed</span><span class="text-white">{formatDuration(elapsed()!)}</span>
            </Show>
            <Show when={throughput() != null}>
              <span class="text-astro-muted">Throughput</span><span class="text-white">{throughput()} files/s</span>
            </Show>
          </div>
          <Show when={scanStatus().total > 0}>
            <div class="w-full bg-astro-dark rounded-full h-3 overflow-hidden flex">
              <div class="bg-green-500 h-3 transition-all" style={{ width: `${(scanStatus().completed / scanStatus().total) * 100}%` }} />
              <div class="bg-red-500 h-3 transition-all" style={{ width: `${(scanStatus().failed / scanStatus().total) * 100}%` }} />
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default ScanManager;
```

- [ ] **Step 2: Create DatabaseOverview**

```typescript
import { Component } from "solid-js";
import type { AggregateStats } from "../types";

function formatHours(s: number): string { return (s / 3600).toFixed(1) + "h"; }
function formatBytes(b: number): string {
  if (b < 1e9) return (b / 1e6).toFixed(0) + " MB";
  if (b < 1e12) return (b / 1e9).toFixed(1) + " GB";
  return (b / 1e12).toFixed(2) + " TB";
}

const DatabaseOverview: Component<{ overview: AggregateStats }> = (props) => {
  const cards = () => [
    { label: "Total Integration", value: formatHours(props.overview.total_integration_seconds) },
    { label: "Targets", value: String(props.overview.target_count) },
    { label: "Total Frames", value: props.overview.total_frames.toLocaleString() },
    { label: "Total Storage", value: formatBytes(props.overview.disk_usage_bytes) },
  ];

  return (
    <div class="grid grid-cols-4 gap-3">
      {cards().map((c) => (
        <div class="bg-astro-panel rounded-lg p-4 text-center">
          <div class="text-xs text-astro-muted mb-1">{c.label}</div>
          <div class="text-white font-bold text-xl">{c.value}</div>
        </div>
      ))}
    </div>
  );
};

export default DatabaseOverview;
```

- [ ] **Step 3: Create EquipmentInventory**

```typescript
import { Component, For } from "solid-js";
import type { EquipmentItem } from "../types";

const EquipmentInventory: Component<{ cameras: EquipmentItem[]; telescopes: EquipmentItem[] }> = (props) => {
  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <h3 class="text-white font-medium text-sm">Equipment Inventory</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <h4 class="text-xs text-astro-muted mb-2">Cameras</h4>
          <For each={props.cameras}>{(c) => (
            <div class="flex justify-between text-xs py-1 border-b border-gray-800/30">
              <span class="text-white">{c.name}</span>
              <span class="text-astro-muted">{c.frame_count.toLocaleString()} frames</span>
            </div>
          )}</For>
        </div>
        <div>
          <h4 class="text-xs text-astro-muted mb-2">Telescopes</h4>
          <For each={props.telescopes}>{(t) => (
            <div class="flex justify-between text-xs py-1 border-b border-gray-800/30">
              <span class="text-white">{t.name}</span>
              <span class="text-astro-muted">{t.frame_count.toLocaleString()} frames</span>
            </div>
          )}</For>
        </div>
      </div>
    </div>
  );
};

export default EquipmentInventory;
```

- [ ] **Step 4: Create FilterUsageChart**

```typescript
import { Component, For } from "solid-js";

const COLOR_MAP: Record<string, string> = {
  Ha: "bg-filter-ha", OIII: "bg-filter-oiii", SII: "bg-filter-sii",
  L: "bg-filter-l", R: "bg-filter-r", G: "bg-filter-g", B: "bg-filter-b",
};

const FilterUsageChart: Component<{ usage: Record<string, number> }> = (props) => {
  const entries = () => Object.entries(props.usage).sort(([, a], [, b]) => b - a);
  const maxVal = () => Math.max(...Object.values(props.usage), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Filter Usage</h3>
      <For each={entries()}>
        {([name, seconds]) => (
          <div class="flex items-center gap-2 text-xs">
            <span class="w-10 text-right text-astro-muted">{name}</span>
            <div class="flex-1 bg-astro-dark rounded-full h-4 overflow-hidden">
              <div
                class={`h-4 rounded-full transition-all ${COLOR_MAP[name] || "bg-gray-500"}`}
                style={{ width: `${(seconds / maxVal()) * 100}%` }}
              />
            </div>
            <span class="w-14 text-right text-white">{(seconds / 3600).toFixed(1)}h</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default FilterUsageChart;
```

- [ ] **Step 5: Create ImagingTimeline**

```typescript
import { Component, For } from "solid-js";
import type { TimelineEntry } from "../types";

const ImagingTimeline: Component<{ timeline: TimelineEntry[] }> = (props) => {
  const maxVal = () => Math.max(...props.timeline.map((t) => t.integration_seconds), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Imaging Timeline</h3>
      <div class="flex items-end gap-1 h-32">
        <For each={props.timeline}>
          {(entry) => (
            <div class="flex-1 flex flex-col items-center gap-1" title={`${entry.month}: ${(entry.integration_seconds / 3600).toFixed(1)}h`}>
              <div
                class="w-full bg-astro-accent rounded-t transition-all min-h-[2px]"
                style={{ height: `${(entry.integration_seconds / maxVal()) * 100}%` }}
              />
              <span class="text-[8px] text-astro-muted rotate-45 origin-left whitespace-nowrap">
                {entry.month.slice(2)}
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default ImagingTimeline;
```

- [ ] **Step 6: Create TopTargets**

```typescript
import { Component, For } from "solid-js";
import type { TopTarget } from "../types";

const TopTargets: Component<{ targets: TopTarget[] }> = (props) => {
  const maxVal = () => Math.max(...props.targets.map((t) => t.integration_seconds), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Top Targets</h3>
      <For each={props.targets.slice(0, 10)}>
        {(target, i) => (
          <div class="flex items-center gap-2 text-xs">
            <span class="w-4 text-astro-muted text-right">{i() + 1}</span>
            <span class="w-24 text-white truncate">{target.name}</span>
            <div class="flex-1 bg-astro-dark rounded-full h-3 overflow-hidden">
              <div
                class="bg-astro-accent h-3 rounded-full"
                style={{ width: `${(target.integration_seconds / maxVal()) * 100}%` }}
              />
            </div>
            <span class="w-12 text-right text-astro-muted">{(target.integration_seconds / 3600).toFixed(1)}h</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default TopTargets;
```

- [ ] **Step 7: Create DataQuality**

```typescript
import { Component, For, Show } from "solid-js";
import type { HfrBucket } from "../types";

const DataQuality: Component<{
  avgHfr: number | null;
  avgEccentricity: number | null;
  bestHfr: number | null;
  hfrDistribution: HfrBucket[];
}> = (props) => {
  const maxCount = () => Math.max(...props.hfrDistribution.map((b) => b.count), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <h3 class="text-white font-medium text-sm">Data Quality</h3>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-astro-dark rounded p-2">
          <div class="text-[10px] text-astro-muted">Avg HFR</div>
          <div class="text-white font-semibold text-sm">{props.avgHfr?.toFixed(2) ?? "—"}</div>
        </div>
        <div class="bg-astro-dark rounded p-2">
          <div class="text-[10px] text-astro-muted">Avg Ecc.</div>
          <div class="text-white font-semibold text-sm">{props.avgEccentricity?.toFixed(2) ?? "—"}</div>
        </div>
        <div class="bg-astro-dark rounded p-2">
          <div class="text-[10px] text-astro-muted">Best HFR</div>
          <div class="text-green-400 font-semibold text-sm">{props.bestHfr?.toFixed(2) ?? "—"}</div>
        </div>
      </div>
      <Show when={props.hfrDistribution.length > 0}>
        <div class="space-y-1">
          <h4 class="text-xs text-astro-muted">HFR Distribution</h4>
          <div class="flex items-end gap-1 h-16">
            <For each={props.hfrDistribution}>
              {(bucket) => (
                <div class="flex-1 flex flex-col items-center" title={`${bucket.bucket}: ${bucket.count}`}>
                  <div
                    class="w-full bg-astro-accent/70 rounded-t min-h-[2px]"
                    style={{ height: `${(bucket.count / maxCount()) * 100}%` }}
                  />
                  <span class="text-[7px] text-astro-muted mt-0.5">{bucket.bucket}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default DataQuality;
```

- [ ] **Step 8: Create StorageBreakdown**

```typescript
import { Component } from "solid-js";

function formatBytes(b: number): string {
  if (b < 1e6) return (b / 1e3).toFixed(0) + " KB";
  if (b < 1e9) return (b / 1e6).toFixed(0) + " MB";
  if (b < 1e12) return (b / 1e9).toFixed(1) + " GB";
  return (b / 1e12).toFixed(2) + " TB";
}

const StorageBreakdown: Component<{
  fitsBytes: number;
  thumbnailBytes: number;
  databaseBytes: number;
}> = (props) => {
  const total = () => props.fitsBytes + props.thumbnailBytes + props.databaseBytes;
  const pct = (v: number) => total() > 0 ? ((v / total()) * 100).toFixed(1) : "0";

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <h3 class="text-white font-medium text-sm">Storage Breakdown</h3>
      {/* Stacked bar */}
      <div class="w-full h-4 bg-astro-dark rounded-full overflow-hidden flex">
        <div class="bg-blue-500 h-4" style={{ width: `${pct(props.fitsBytes)}%` }} title="FITS" />
        <div class="bg-green-500 h-4" style={{ width: `${pct(props.thumbnailBytes)}%` }} title="Thumbnails" />
        <div class="bg-yellow-500 h-4" style={{ width: `${pct(props.databaseBytes)}%` }} title="Database" />
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs text-center">
        <div><span class="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1" />FITS: {formatBytes(props.fitsBytes)}</div>
        <div><span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-1" />Thumbs: {formatBytes(props.thumbnailBytes)}</div>
        <div><span class="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1" />DB: {formatBytes(props.databaseBytes)}</div>
      </div>
    </div>
  );
};

export default StorageBreakdown;
```

- [ ] **Step 9: Create IngestHistory**

```typescript
import { Component, For } from "solid-js";

const IngestHistory: Component<{ history: { date: string; files_added: number }[] }> = (props) => {
  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Ingest History</h3>
      <div class="max-h-48 overflow-y-auto">
        <For each={props.history}>
          {(entry) => (
            <div class="flex justify-between text-xs py-1 border-b border-gray-800/30">
              <span class="text-white">{entry.date}</span>
              <span class="text-astro-muted">+{entry.files_added} files</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default IngestHistory;
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ScanManager.tsx frontend/src/components/DatabaseOverview.tsx frontend/src/components/EquipmentInventory.tsx frontend/src/components/FilterUsageChart.tsx frontend/src/components/ImagingTimeline.tsx frontend/src/components/TopTargets.tsx frontend/src/components/DataQuality.tsx frontend/src/components/StorageBreakdown.tsx frontend/src/components/IngestHistory.tsx
git commit -m "feat: add admin page analytics components"
```

---

## Task 15: Admin Page

**Files:**
- Create: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Create AdminPage**

```typescript
import { Component, Show } from "solid-js";
import { useStats } from "../store/stats";
import ScanManager from "../components/ScanManager";
import DatabaseOverview from "../components/DatabaseOverview";
import EquipmentInventory from "../components/EquipmentInventory";
import FilterUsageChart from "../components/FilterUsageChart";
import ImagingTimeline from "../components/ImagingTimeline";
import TopTargets from "../components/TopTargets";
import DataQuality from "../components/DataQuality";
import StorageBreakdown from "../components/StorageBreakdown";
import IngestHistory from "../components/IngestHistory";

const AdminPage: Component = () => {
  const { stats } = useStats();

  return (
    <div class="p-4 space-y-4 max-w-7xl mx-auto">
      <ScanManager />

      <Show when={stats.loading}>
        <div class="text-center text-astro-muted py-8">Loading analytics...</div>
      </Show>

      <Show when={stats.error}>
        <div class="text-center text-red-400 py-8">Failed to load stats</div>
      </Show>

      <Show when={stats()}>
        {(data) => (
          <>
            <DatabaseOverview overview={data().overview} />

            <div class="grid grid-cols-2 gap-4">
              <FilterUsageChart usage={data().filter_usage} />
              <EquipmentInventory cameras={data().equipment.cameras} telescopes={data().equipment.telescopes} />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <ImagingTimeline timeline={data().timeline} />
              <TopTargets targets={data().top_targets} />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <DataQuality
                avgHfr={data().data_quality.avg_hfr}
                avgEccentricity={data().data_quality.avg_eccentricity}
                bestHfr={data().data_quality.best_hfr}
                hfrDistribution={data().data_quality.hfr_distribution}
              />
              <StorageBreakdown
                fitsBytes={data().storage.fits_bytes}
                thumbnailBytes={data().storage.thumbnail_bytes}
                databaseBytes={data().storage.database_bytes}
              />
            </div>

            <IngestHistory history={data().ingest_history} />
          </>
        )}
      </Show>
    </div>
  );
};

export default AdminPage;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat: add AdminPage assembling all analytics widgets"
```

---

## Task 16: Wire Up Routes in App.tsx and Clean Up Old Components

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.tsx`
- Remove: `frontend/src/components/Gallery.tsx`
- Remove: `frontend/src/components/GalleryCard.tsx`
- Remove: `frontend/src/components/FilterPanel.tsx`
- Remove: `frontend/src/components/ImageDetail.tsx`
- Remove: `frontend/src/components/HeaderTable.tsx`
- Remove: `frontend/src/components/ScanDashboard.tsx`

- [ ] **Step 1: Finalize index.tsx with route definitions**

The exact routing API depends on the installed `@solidjs/router` version. With v0.14+:

```typescript
/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./index.css";
import App from "./App";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";

const root = document.getElementById("root");
render(
  () => (
    <Router root={App}>
      <Route path="/" component={DashboardPage} />
      <Route path="/admin" component={AdminPage} />
    </Router>
  ),
  root!,
);
```

- [ ] **Step 2: Finalize App.tsx**

```typescript
import { type Component, type ParentProps } from "solid-js";
import NavBar from "./components/NavBar";

const App: Component<ParentProps> = (props) => {
  return (
    <div class="min-h-screen bg-astro-dark">
      <NavBar />
      {props.children}
    </div>
  );
};

export default App;
```

- [ ] **Step 3: Remove old components**

```bash
rm frontend/src/components/Gallery.tsx
rm frontend/src/components/GalleryCard.tsx
rm frontend/src/components/FilterPanel.tsx
rm frontend/src/components/ImageDetail.tsx
rm frontend/src/components/HeaderTable.tsx
rm frontend/src/components/ScanDashboard.tsx
```

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/
git commit -m "feat: wire up routes, remove old gallery components"
```

---

## Task 17: Build Verification

- [ ] **Step 1: Install dependencies and build**

```bash
cd frontend && npm install && npm run build
```

Fix any TypeScript or build errors.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve build errors from UI redesign"
```
