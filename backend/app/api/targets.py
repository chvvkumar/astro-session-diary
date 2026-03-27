import re
import uuid
import statistics
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func, cast, Float, Date, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Target, Image
from app.services.normalization import load_alias_maps, normalize_filter, normalize_equipment, expand_canonical
from app.schemas.target import (
    TargetAggregationResponse, TargetAggregation, SessionSummary,
    AggregateStats, EquipmentResponse, SessionDetailResponse,
    TargetDetailResponse, SessionOverview, FilterDetail, SessionInsight, FrameRecord,
    TargetSearchResultFuzzy,
)

router = APIRouter(prefix="/targets", tags=["targets"])


# --- 1. Search (must be FIRST) ---

@router.get("/search", response_model=list[TargetSearchResultFuzzy])
async def search_targets(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Search targets by name or alias with fuzzy trigram matching."""
    pattern = f"%{q}%"

    # Tier 1: Exact substring matches — exclude soft-deleted
    exact_query = (
        select(Target)
        .where(
            Target.merged_into_id.is_(None),
            or_(
                Target.primary_name.ilike(pattern),
                Target.aliases.any(func.upper(q)),
            ),
        )
        .limit(limit)
    )
    exact_result = await session.execute(exact_query)
    exact_targets = exact_result.scalars().all()

    exact_ids = {t.id for t in exact_targets}
    results = []
    for t in exact_targets:
        match_source = None
        if q.upper() not in t.primary_name.upper():
            for alias in (t.aliases or []):
                if q.upper() in alias.upper():
                    match_source = alias
                    break
        results.append(TargetSearchResultFuzzy(
            id=t.id,
            primary_name=t.primary_name,
            object_type=t.object_type,
            aliases=t.aliases or [],
            match_source=match_source,
            similarity_score=1.0,
        ))

    # Tier 2: Fuzzy trigram matches if we need more
    if len(results) < limit:
        remaining = limit - len(results)
        fuzzy_query = (
            select(Target, func.similarity(Target.primary_name, q).label("score"))
            .where(
                Target.merged_into_id.is_(None),
                Target.id.notin_(exact_ids) if exact_ids else True,
                func.similarity(Target.primary_name, q) > 0.15,
            )
            .order_by(func.similarity(Target.primary_name, q).desc())
            .limit(remaining)
        )
        fuzzy_result = await session.execute(fuzzy_query)
        for target, score in fuzzy_result.all():
            best_alias = None
            for alias in (target.aliases or []):
                if q.upper() in alias.upper():
                    best_alias = alias
                    break
            results.append(TargetSearchResultFuzzy(
                id=target.id,
                primary_name=target.primary_name,
                object_type=target.object_type,
                aliases=target.aliases or [],
                match_source=best_alias,
                similarity_score=float(score),
            ))

    return results


# --- 2. Equipment (SECOND — before path-parameter routes) ---

@router.get("/equipment", response_model=EquipmentResponse)
async def get_equipment(session: AsyncSession = Depends(get_session)):
    """Return distinct camera and telescope values."""
    filter_map, cam_map, tel_map = await load_alias_maps(session)
    cam_result = await session.execute(
        select(Image.camera).where(Image.camera.isnot(None)).distinct().order_by(Image.camera)
    )
    tel_result = await session.execute(
        select(Image.telescope).where(Image.telescope.isnot(None)).distinct().order_by(Image.telescope)
    )
    raw_cameras = [r[0] for r in cam_result.all() if r[0]]
    raw_telescopes = [r[0] for r in tel_result.all() if r[0]]
    cameras = list(dict.fromkeys(normalize_equipment(c, cam_map) or c for c in raw_cameras))
    telescopes = list(dict.fromkeys(normalize_equipment(t, tel_map) or t for t in raw_telescopes))
    return EquipmentResponse(
        cameras=cameras,
        telescopes=telescopes,
    )


# --- 2b. FITS keys (before path-parameter routes) ---

@router.get("/fits-keys", response_model=list[str])
async def get_fits_keys(session: AsyncSession = Depends(get_session)):
    """Return distinct FITS header keys found across all images."""
    result = await session.execute(
        text("SELECT DISTINCT key FROM images, jsonb_object_keys(raw_headers) AS key ORDER BY key")
    )
    return [row[0] for row in result.all()]


# --- 2c. Target detail (before path-parameter routes) ---

@router.get("/{target_id:path}/detail", response_model=TargetDetailResponse)
async def get_target_detail(
    target_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Return target identity with cumulative stats and session overviews."""
    if target_id.startswith("obj:"):
        object_name = target_id[4:]
        target_name = object_name
        target_obj = None
        query = (
            select(Image)
            .where(
                Image.raw_headers["OBJECT"].astext == object_name,
                Image.image_type == "LIGHT",
            )
            .order_by(Image.capture_date)
        )
    else:
        try:
            tid = uuid.UUID(target_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid target ID")
        target_obj = await session.get(Target, tid)
        if not target_obj:
            raise HTTPException(status_code=404, detail="Target not found")
        target_name = target_obj.primary_name
        query = (
            select(Image)
            .where(
                Image.resolved_target_id == tid,
                Image.image_type == "LIGHT",
            )
            .order_by(Image.capture_date)
        )

    result = await session.execute(query)
    images = result.scalars().all()

    if not images:
        raise HTTPException(status_code=404, detail="No images found for this target")

    filter_map, cam_map, tel_map = await load_alias_maps(session)

    sessions_map: dict[str, list] = defaultdict(list)
    all_hfr = []
    all_ecc = []
    equipment_set: set[str] = set()
    filters_set: set[str] = set()
    total_exp = 0.0

    for img in images:
        date_key = img.capture_date.strftime("%Y-%m-%d") if img.capture_date else "unknown"
        sessions_map[date_key].append(img)
        total_exp += img.exposure_time or 0
        if img.median_hfr is not None:
            all_hfr.append(img.median_hfr)
        if img.eccentricity is not None:
            all_ecc.append(img.eccentricity)
        cam = normalize_equipment(img.camera, cam_map)
        tel = normalize_equipment(img.telescope, tel_map)
        f = normalize_filter(img.filter_used, filter_map)
        if cam:
            equipment_set.add(cam)
        if tel:
            equipment_set.add(tel)
        if f:
            filters_set.add(f)

    session_overviews = []
    for date_key in sorted(sessions_map.keys(), reverse=True):
        sess_images = sessions_map[date_key]
        sess_hfr = [i.median_hfr for i in sess_images if i.median_hfr is not None]
        sess_ecc = [i.eccentricity for i in sess_images if i.eccentricity is not None]
        sess_filters = sorted({normalize_filter(i.filter_used, filter_map) for i in sess_images if i.filter_used})
        sess_exp = sum(i.exposure_time or 0 for i in sess_images)
        session_overviews.append(SessionOverview(
            session_date=date_key,
            integration_seconds=sess_exp,
            frame_count=len(sess_images),
            median_hfr=statistics.median(sess_hfr) if sess_hfr else None,
            median_eccentricity=statistics.median(sess_ecc) if sess_ecc else None,
            filters_used=sess_filters,
            camera=normalize_equipment(sess_images[0].camera, cam_map),
            telescope=normalize_equipment(sess_images[0].telescope, tel_map),
        ))

    sorted_dates = sorted(sessions_map.keys())

    return TargetDetailResponse(
        target_id=target_id,
        primary_name=target_name,
        aliases=target_obj.aliases if target_obj else [],
        object_type=target_obj.object_type if target_obj else None,
        ra=target_obj.ra if target_obj else None,
        dec=target_obj.dec if target_obj else None,
        total_integration_seconds=total_exp,
        total_frames=len(images),
        avg_hfr=statistics.mean(all_hfr) if all_hfr else None,
        avg_eccentricity=statistics.mean(all_ecc) if all_ecc else None,
        filters_used=sorted(filters_set),
        equipment=sorted(equipment_set),
        first_session_date=sorted_dates[0] if sorted_dates else "",
        last_session_date=sorted_dates[-1] if sorted_dates else "",
        session_count=len(sessions_map),
        sessions=session_overviews,
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
    filter_map, cam_map, tel_map = await load_alias_maps(session)

    # Base query: only LIGHT frames that have a known object name
    base_filter = [Image.image_type == "LIGHT"]

    if camera:
        cam_variants = expand_canonical(camera, cam_map)
        base_filter.append(Image.camera.in_(cam_variants))
    if telescope:
        tel_variants = expand_canonical(telescope, tel_map)
        base_filter.append(Image.telescope.in_(tel_variants))
    if filters:
        filter_list = [f.strip() for f in filters.split(",")]
        all_filter_variants = []
        for f in filter_list:
            all_filter_variants.extend(expand_canonical(f, filter_map))
        base_filter.append(Image.filter_used.in_(all_filter_variants))
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
                func.similarity(Target.primary_name, search) > 0.15,
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
        else:
            object_name = (image.raw_headers or {}).get("OBJECT")
            if not object_name:
                continue  # skip images with no object name at all
            tid = f"obj:{object_name}"  # synthetic ID for unresolved objects
            name = object_name

        if tid not in targets_map:
            targets_map[tid] = {
                "target_id": tid,
                "primary_name": name,
                "aliases_set": set(),
                "total_integration_seconds": 0,
                "total_frames": 0,
                "filter_distribution": defaultdict(float),
                "equipment_set": set(),
            }
        # Collect distinct FITS OBJECT names as human-readable aliases
        fits_object = (image.raw_headers or {}).get("OBJECT")
        if fits_object:
            targets_map[tid]["aliases_set"].add(fits_object)
        t = targets_map[tid]
        exp = image.exposure_time or 0
        t["total_integration_seconds"] += exp
        t["total_frames"] += 1
        f = normalize_filter(image.filter_used, filter_map)
        cam = normalize_equipment(image.camera, cam_map)
        tel = normalize_equipment(image.telescope, tel_map)
        if f:
            t["filter_distribution"][f] += exp
        if cam:
            t["equipment_set"].add(cam)
        if tel:
            t["equipment_set"].add(tel)

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
        if f:
            s["filters_set"].add(f)

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
            aliases=sorted(t["aliases_set"]),
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

    all_dates = [s.session_date for t in target_list for s in t.sessions]
    oldest_date = min(all_dates) if all_dates else None
    newest_date = max(all_dates) if all_dates else None

    aggregates = AggregateStats(
        total_integration_seconds=total_seconds,
        target_count=len(target_list),
        total_frames=total_frames,
        disk_usage_bytes=0,
        oldest_date=oldest_date,
        newest_date=newest_date,
    )

    return TargetAggregationResponse(targets=target_list, aggregates=aggregates)


# --- 4. Session detail (LAST — has path parameters) ---


def _compute_insights(
    *,
    median_hfr: float | None,
    median_ecc: float | None,
    hfr_values: list[float],
    ecc_values: list[float],
    temp_values: list[float],
    target_avg_hfr: float | None,
    is_best_hfr: bool,
    first_frame,
    last_frame,
) -> list[SessionInsight]:
    insights = []

    if first_frame.capture_date and last_frame.capture_date:
        duration = last_frame.capture_date - first_frame.capture_date
        hours = duration.total_seconds() / 3600
        minutes = (duration.total_seconds() % 3600) / 60
        insights.append(SessionInsight(
            level="info",
            message=f"Session duration: {int(hours)}h {int(minutes)}m ({first_frame.capture_date.strftime('%H:%M')} \u2192 {last_frame.capture_date.strftime('%H:%M')})",
        ))

    if median_hfr is not None and target_avg_hfr is not None:
        if is_best_hfr:
            insights.append(SessionInsight(
                level="good",
                message=f"Best HFR session for this target (median {median_hfr:.2f} vs target avg {target_avg_hfr:.2f})",
            ))
        elif median_hfr > target_avg_hfr * 1.3:
            insights.append(SessionInsight(
                level="warning",
                message=f"Poor HFR session (median {median_hfr:.2f} vs target avg {target_avg_hfr:.2f})",
            ))

    if temp_values:
        temp_range = max(temp_values) - min(temp_values)
        if temp_range < 1.0:
            insights.append(SessionInsight(
                level="good",
                message=f"Stable sensor temperature ({min(temp_values):.0f}\u00b0C \u00b1 {temp_range:.1f}\u00b0C)",
            ))
        elif temp_range >= 3.0:
            insights.append(SessionInsight(
                level="warning",
                message=f"Unstable sensor temperature (range: {min(temp_values):.0f}\u00b0C to {max(temp_values):.0f}\u00b0C)",
            ))

    if median_hfr is not None and len(hfr_values) > 2:
        threshold = median_hfr * 1.5
        outlier_count = sum(1 for v in hfr_values if v > threshold)
        if outlier_count > 0:
            insights.append(SessionInsight(
                level="warning",
                message=f"{outlier_count} frame{'s' if outlier_count > 1 else ''} with HFR outlier{'s' if outlier_count > 1 else ''} (> {threshold:.1f})",
            ))

    if median_ecc is not None and len(ecc_values) > 2:
        threshold = median_ecc * 1.5
        outlier_count = sum(1 for v in ecc_values if v > threshold)
        if outlier_count > 0:
            insights.append(SessionInsight(
                level="warning",
                message=f"{outlier_count} frame{'s' if outlier_count > 1 else ''} with eccentricity outlier{'s' if outlier_count > 1 else ''} (> {threshold:.2f})",
            ))

    return insights


@router.get("/{target_id:path}/sessions/{date}", response_model=SessionDetailResponse)
async def get_session_detail(
    target_id: str,
    date: str,
    session: AsyncSession = Depends(get_session),
):
    """Return detailed session data for a target on a specific date."""
    if target_id.startswith("obj:"):
        object_name = target_id[4:]
        target_name = object_name
        target_obj = None
        query = (
            select(Image)
            .where(
                Image.raw_headers["OBJECT"].astext == object_name,
                Image.capture_date >= datetime.fromisoformat(date),
                Image.capture_date < datetime.fromisoformat(date) + timedelta(days=1),
                Image.image_type == "LIGHT",
            )
            .order_by(Image.capture_date)
        )
        all_images_query = (
            select(Image)
            .where(
                Image.raw_headers["OBJECT"].astext == object_name,
                Image.image_type == "LIGHT",
            )
        )
    else:
        try:
            tid = uuid.UUID(target_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid target ID")
        target_obj = await session.get(Target, tid)
        if not target_obj:
            raise HTTPException(status_code=404, detail="Target not found")
        target_name = target_obj.primary_name
        query = (
            select(Image)
            .where(
                Image.resolved_target_id == tid,
                Image.capture_date >= datetime.fromisoformat(date),
                Image.capture_date < datetime.fromisoformat(date) + timedelta(days=1),
                Image.image_type == "LIGHT",
            )
            .order_by(Image.capture_date)
        )
        all_images_query = (
            select(Image)
            .where(
                Image.resolved_target_id == tid,
                Image.image_type == "LIGHT",
            )
        )

    result = await session.execute(query)
    images = result.scalars().all()

    if not images:
        raise HTTPException(status_code=404, detail="No images found for this session")

    all_result = await session.execute(all_images_query)
    all_images = all_result.scalars().all()
    all_hfr_values = [i.median_hfr for i in all_images if i.median_hfr is not None]
    target_avg_hfr = statistics.mean(all_hfr_values) if all_hfr_values else None

    filter_map, cam_map, tel_map = await load_alias_maps(session)

    total_exp = sum(img.exposure_time or 0 for img in images)
    filters_used: dict[str, int] = {}
    hfr_values = []
    ecc_values = []
    temp_values = []

    for img in images:
        f = normalize_filter(img.filter_used, filter_map)
        if f:
            filters_used[f] = filters_used.get(f, 0) + 1
        if img.median_hfr is not None:
            hfr_values.append(img.median_hfr)
        if img.eccentricity is not None:
            ecc_values.append(img.eccentricity)
        if img.sensor_temp is not None:
            temp_values.append(img.sensor_temp)

    ref_image = images[0]
    thumb_url = None
    if ref_image.thumbnail_path:
        filename = ref_image.thumbnail_path.split("/")[-1].split("\\")[-1]
        thumb_url = f"/thumbnails/{filename}"

    median_hfr = statistics.median(hfr_values) if hfr_values else None
    median_ecc = statistics.median(ecc_values) if ecc_values else None

    filter_groups: dict[str, list] = defaultdict(list)
    for img in images:
        f = normalize_filter(img.filter_used, filter_map)
        if f:
            filter_groups[f].append(img)

    filter_details = []
    for fname, fimages in sorted(filter_groups.items()):
        f_hfr = [i.median_hfr for i in fimages if i.median_hfr is not None]
        f_ecc = [i.eccentricity for i in fimages if i.eccentricity is not None]
        f_exp = sum(i.exposure_time or 0 for i in fimages)
        filter_details.append(FilterDetail(
            filter_name=fname,
            frame_count=len(fimages),
            integration_seconds=f_exp,
            median_hfr=statistics.median(f_hfr) if f_hfr else None,
            median_eccentricity=statistics.median(f_ecc) if f_ecc else None,
            exposure_time=fimages[0].exposure_time,
        ))

    frames = []
    for img in images:
        frames.append(FrameRecord(
            timestamp=img.capture_date.isoformat() if img.capture_date else "",
            filter_used=normalize_filter(img.filter_used, filter_map),
            exposure_time=img.exposure_time,
            median_hfr=img.median_hfr,
            eccentricity=img.eccentricity,
            sensor_temp=img.sensor_temp,
            gain=img.camera_gain,
            file_name=img.file_name,
        ))

    is_best_hfr = False
    if median_hfr is not None:
        all_session_dates: dict[str, list[float]] = defaultdict(list)
        for img in all_images:
            if img.median_hfr is not None and img.capture_date:
                dk = img.capture_date.strftime("%Y-%m-%d")
                all_session_dates[dk].append(img.median_hfr)
        all_session_medians = [statistics.median(v) for v in all_session_dates.values() if v]
        if all_session_medians:
            is_best_hfr = median_hfr <= min(all_session_medians)

    insights = _compute_insights(
        median_hfr=median_hfr,
        median_ecc=median_ecc,
        hfr_values=hfr_values,
        ecc_values=ecc_values,
        temp_values=temp_values,
        target_avg_hfr=target_avg_hfr,
        is_best_hfr=is_best_hfr,
        first_frame=images[0],
        last_frame=images[-1],
    )

    return SessionDetailResponse(
        target_name=target_name,
        session_date=date,
        thumbnail_url=thumb_url,
        frame_count=len(images),
        integration_seconds=total_exp,
        median_hfr=median_hfr,
        median_eccentricity=median_ecc,
        filters_used=filters_used,
        equipment={
            "camera": normalize_equipment(ref_image.camera, cam_map),
            "telescope": normalize_equipment(ref_image.telescope, tel_map),
        },
        raw_reference_header=ref_image.raw_headers,
        min_hfr=min(hfr_values) if hfr_values else None,
        max_hfr=max(hfr_values) if hfr_values else None,
        min_eccentricity=min(ecc_values) if ecc_values else None,
        max_eccentricity=max(ecc_values) if ecc_values else None,
        sensor_temp=statistics.median(temp_values) if temp_values else None,
        sensor_temp_min=min(temp_values) if temp_values else None,
        sensor_temp_max=max(temp_values) if temp_values else None,
        gain=ref_image.camera_gain,
        exposure_time=ref_image.exposure_time,
        first_frame_time=images[0].capture_date.isoformat() if images[0].capture_date else None,
        last_frame_time=images[-1].capture_date.isoformat() if images[-1].capture_date else None,
        filter_details=filter_details,
        insights=insights,
        frames=frames,
    )
