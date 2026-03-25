import re
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

router = APIRouter(prefix="/targets", tags=["targets"])


# --- 1. Search (must be FIRST) ---

@router.get("/search", response_model=list[TargetSearchResult])
async def search_targets(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Search targets by name or alias for autocomplete."""
    pattern = f"%{q}%"
    query = (
        select(Target)
        .where(
            or_(
                Target.primary_name.ilike(pattern),
                Target.aliases.any(func.upper(q)),
            )
        )
        .limit(limit)
    )
    result = await session.execute(query)
    targets = result.scalars().all()
    return [TargetSearchResult.model_validate(t) for t in targets]


# --- 2. Equipment (SECOND — before path-parameter routes) ---

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


# --- 3. Aggregation (THIRD — after fixed paths, before path params) ---

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
    # Base query: only LIGHT frames that have a known object name
    base_filter = [Image.image_type == "LIGHT"]

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
        # Search in target name OR OBJECT header for unresolved images
        base_filter.append(
            or_(
                Target.primary_name.ilike(pattern),
                Image.raw_headers["OBJECT"].astext.ilike(pattern),
            )
        )

    # FITS header queries (AND logic between rows)
    if fits_key and fits_op and fits_val:
        for key, op_str, val in zip(fits_key, fits_op, fits_val):
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

    # Query images with optional target join
    query = (
        select(Image, Target)
        .outerjoin(Target, Image.resolved_target_id == Target.id)
        .where(*base_filter)
        .order_by(Image.capture_date.desc())
    )
    result = await session.execute(query)
    rows = result.all()

    # Build target aggregations in Python
    # Group by resolved target ID, or by OBJECT header name for unresolved images
    targets_map: dict[str, dict] = {}
    sessions_map: dict[str, dict[str, dict]] = defaultdict(dict)

    for image, target in rows:
        # Determine grouping key: resolved target or OBJECT header
        if target:
            tid = str(target.id)
            name = target.primary_name
            aliases = target.aliases or []
        else:
            object_name = (image.raw_headers or {}).get("OBJECT")
            if not object_name:
                continue  # skip images with no object name at all
            tid = f"obj:{object_name}"  # synthetic ID for unresolved objects
            name = object_name
            aliases = []

        if tid not in targets_map:
            targets_map[tid] = {
                "target_id": tid,
                "primary_name": name,
                "aliases": aliases,
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

    aggregates = AggregateStats(
        total_integration_seconds=total_seconds,
        target_count=len(target_list),
        total_frames=total_frames,
        disk_usage_bytes=0,
    )

    return TargetAggregationResponse(targets=target_list, aggregates=aggregates)


# --- 4. Session detail (LAST — has path parameters) ---

@router.get("/{target_id}/sessions/{date}", response_model=SessionDetailResponse)
async def get_session_detail(
    target_id: uuid.UUID,
    date: str,
    session: AsyncSession = Depends(get_session),
):
    """Return detailed session data for a target on a specific date."""
    target = await session.get(Target, target_id)
    if not target:
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
