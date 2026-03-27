import logging
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Image, Target
from app.models.user_settings import UserSettings, SETTINGS_ROW_ID
from app.services.scanner import extract_metadata
from app.services.simbad import resolve_target_name, normalize_object_name
from app.services.thumbnail import generate_thumbnail
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# Celery uses sync — create a sync engine for the worker
# Replace asyncpg with psycopg2 for sync operations
_sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
_sync_engine = create_engine(_sync_url)

# Ensure database tables exist when worker starts
from app.models import Base
Base.metadata.create_all(_sync_engine)

from app.config import get_sync_redis
from app.services.scan_state import (
    increment_completed_sync, increment_failed_sync,
    start_scanning_sync, set_ingesting_sync, set_idle_sync,
)

_redis = get_sync_redis()


@celery_app.task(bind=True)
def run_scan(self, include_calibration: bool = True) -> dict:
    """Scan the FITS directory and queue ingest tasks for new files.

    Runs entirely inside Celery so the HTTP endpoint returns immediately.
    """
    from app.services.scanner import scan_directory

    start_scanning_sync(_redis)

    # Get known paths from DB
    with Session(_sync_engine) as session:
        result = session.execute(select(Image.file_path))
        known_paths = {row[0] for row in result.all()}

    fits_root = Path(settings.fits_data_path)
    new_files = list(scan_directory(
        fits_root, known_paths=known_paths, include_calibration=include_calibration,
    ))

    if not new_files:
        set_idle_sync(_redis)
        return {"status": "complete", "new_files_queued": 0, "already_known": len(known_paths)}

    set_ingesting_sync(_redis, total=len(new_files))

    for fits_path in new_files:
        ingest_file.delay(str(fits_path))

    # Queue duplicate detection after ingest
    detect_duplicate_targets.apply_async(countdown=30)

    return {
        "status": "ingesting",
        "new_files_queued": len(new_files),
        "already_known": len(known_paths),
    }


@celery_app.task
def auto_scan_tick():
    """Heartbeat task: check if an auto-scan is due and dispatch if so."""
    import time

    # Read auto-scan config from DB (migrated from Redis)
    with Session(_sync_engine) as db_session:
        row = db_session.execute(
            select(UserSettings).where(UserSettings.id == SETTINGS_ROW_ID)
        ).scalar_one_or_none()

    if row is None or not (row.general or {}).get("auto_scan_enabled", True):
        return

    interval_minutes = (row.general or {}).get("auto_scan_interval", 240)
    last_run_str = _redis.get("autoscan:last_run")
    now = time.time()

    if last_run_str:
        last_run = float(last_run_str)
        if now - last_run < interval_minutes * 60:
            return

    # Check if a scan is already running
    from app.services.scan_state import _parse_snapshot, SCAN_KEY
    data = _redis.hgetall(SCAN_KEY)
    snap = _parse_snapshot(data)
    if snap.state in ("scanning", "ingesting"):
        return

    # Dispatch scan
    _redis.set("autoscan:last_run", str(now))
    logger.info("Auto-scan triggered (interval=%dm)", interval_minutes)
    include_cal = (row.general or {}).get("include_calibration", True)
    run_scan.delay(include_calibration=include_cal)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def ingest_file(self, fits_path: str) -> dict:
    """Full ingest pipeline for a single FITS file.

    1. Extract metadata from FITS headers
    2. Generate stretched JPEG thumbnail
    3. Resolve target name via SIMBAD (with local cache)
    4. Insert/update database record
    """
    path = Path(fits_path)
    logger.info("Ingesting: %s", path.name)

    try:
        # Step 1: Extract metadata
        meta = extract_metadata(path)

        # Step 2: Generate thumbnail
        import hashlib
        path_hash = hashlib.md5(str(path).encode()).hexdigest()[:12]
        thumb_filename = f"{path.stem}_{path_hash}.jpg"
        thumb_path = Path(settings.thumbnails_path) / thumb_filename
        generate_thumbnail(path, thumb_path, max_width=settings.thumbnail_max_width)

        # Step 3: Resolve target (sync wrapper for async SIMBAD call)
        # Skip SIMBAD for calibration frames — they're not astronomical targets
        target_id = None
        image_type = (meta.get("image_type") or "").upper()
        if image_type not in ("DARK", "FLAT", "BIAS", "DARKFLAT"):
            object_name = meta.get("object_name")
            if object_name:
                target_id = _resolve_or_cache_target(object_name)

        # Step 4: Insert into database
        with Session(_sync_engine) as session:
            image = Image(
                file_path=meta["file_path"],
                file_name=meta["file_name"],
                capture_date=meta.get("capture_date"),
                thumbnail_path=str(thumb_path),
                resolved_target_id=target_id,
                exposure_time=meta.get("exposure_time"),
                filter_used=meta.get("filter_used"),
                sensor_temp=meta.get("sensor_temp"),
                camera_gain=meta.get("camera_gain"),
                image_type=meta.get("image_type"),
                telescope=meta.get("telescope"),
                camera=meta.get("camera"),
                median_hfr=meta.get("median_hfr"),
                eccentricity=meta.get("eccentricity"),
                raw_headers=meta.get("raw_headers", {}),
            )
            session.add(image)
            session.commit()
            logger.info("Ingested: %s (target=%s)", path.name, target_id)
            increment_completed_sync(_redis)
            return {"file": str(path), "status": "ok"}

    except Exception as exc:
        logger.error("Failed to ingest %s: %s", path, exc)
        # Don't retry on unrecoverable errors (corrupt files, missing headers, etc.)
        unrecoverable = isinstance(exc, (OSError, ValueError)) and (
            "SIMPLE card" in str(exc)
            or "not a valid FITS" in str(exc)
            or "No such file" in str(exc)
        )
        if unrecoverable or self.request.retries >= self.max_retries:
            increment_failed_sync(_redis, file_path=str(path), error=str(exc))
            return {"file": str(path), "status": "failed", "error": str(exc)}
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def regenerate_thumbnail(self, image_id: str, fits_path: str, thumb_path: str) -> dict:
    """Regenerate a single thumbnail using the current stretch algorithm."""
    path = Path(fits_path)
    output = Path(thumb_path)
    logger.info("Regenerating thumbnail: %s", path.name)

    try:
        generate_thumbnail(path, output, max_width=settings.thumbnail_max_width)
        increment_completed_sync(_redis)
        return {"file": str(path), "status": "ok"}
    except Exception as exc:
        logger.error("Failed to regenerate thumbnail for %s: %s", path, exc)
        if self.request.retries >= self.max_retries:
            increment_failed_sync(_redis, file_path=str(path), error=str(exc))
            return {"file": str(path), "status": "failed", "error": str(exc)}
        raise self.retry(exc=exc)


@celery_app.task(name="detect_duplicate_targets")
def detect_duplicate_targets():
    """Detect potential duplicate targets by comparing unresolved names against resolved targets."""
    from sqlalchemy import create_engine, text as sa_text, select as sa_select, func as sa_func
    from sqlalchemy.orm import Session as SyncSession
    from app.config import settings
    from app.models.target import Target
    from app.models.image import Image
    from app.models.merge_candidate import MergeCandidate

    sync_url = settings.database_url.replace("+asyncpg", "")
    engine = create_engine(sync_url)

    with SyncSession(engine) as db:
        # Find distinct unresolved OBJECT names with image counts
        unresolved_query = (
            sa_select(
                Image.raw_headers["OBJECT"].astext.label("object_name"),
                sa_func.count(Image.id).label("img_count"),
            )
            .where(
                Image.resolved_target_id.is_(None),
                Image.image_type == "LIGHT",
                Image.raw_headers["OBJECT"].astext.isnot(None),
            )
            .group_by(Image.raw_headers["OBJECT"].astext)
        )
        unresolved = db.execute(unresolved_query).all()

        if not unresolved:
            return {"candidates_found": 0}

        # Get existing pending/accepted candidates to avoid duplicates
        existing = db.execute(
            sa_select(MergeCandidate.source_name).where(
                MergeCandidate.status.in_(["pending", "accepted"])
            )
        )
        existing_names = {row[0] for row in existing.all()}

        candidates_found = 0

        for obj_name, img_count in unresolved:
            if not obj_name or obj_name in existing_names:
                continue

            # Trigram similarity search against all resolved target aliases
            trgm_query = sa_text("""
                SELECT t.id, t.primary_name,
                       GREATEST(
                           similarity(t.primary_name, :name),
                           COALESCE((SELECT MAX(similarity(a, :name)) FROM unnest(t.aliases) a), 0)
                       ) AS score
                FROM targets t
                WHERE t.merged_into_id IS NULL
                  AND GREATEST(
                      similarity(t.primary_name, :name),
                      COALESCE((SELECT MAX(similarity(a, :name)) FROM unnest(t.aliases) a), 0)
                  ) > 0.4
                ORDER BY score DESC
                LIMIT 1
            """)
            result = db.execute(trgm_query, {"name": obj_name}).first()

            if result:
                target_id, target_name, score = result
                db.add(MergeCandidate(
                    source_name=obj_name,
                    source_image_count=img_count,
                    suggested_target_id=target_id,
                    similarity_score=float(score),
                    method="trigram",
                ))
                candidates_found += 1

        db.commit()

    return {"candidates_found": candidates_found}


# In-memory cache of object names that SIMBAD couldn't resolve.
# Avoids repeated HTTP round-trips for the same unresolvable name
# (e.g., "FlatWizard", "Target", "Moon_fast" on every calibration frame).
_simbad_negative_cache: set[str] = set()


def _resolve_or_cache_target(object_name: str) -> str | None:
    """Check local DB for target, fall back to SIMBAD, cache result."""
    import asyncio

    normalized = normalize_object_name(object_name)

    # Check negative cache first (fastest path)
    if normalized in _simbad_negative_cache:
        return None

    with Session(_sync_engine) as session:
        # Check local cache: search aliases array
        stmt = select(Target).where(Target.aliases.any(normalized))
        existing = session.execute(stmt).scalar_one_or_none()
        if existing:
            return str(existing.id)

        # Also check by primary_name
        stmt = select(Target).where(Target.primary_name == object_name)
        existing = session.execute(stmt).scalar_one_or_none()
        if existing:
            return str(existing.id)

    # Query SIMBAD
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(resolve_target_name(object_name))
    finally:
        loop.close()

    if result is None:
        _simbad_negative_cache.add(normalized)
        return None

    # Cache the new target (handle race condition with other workers)
    with Session(_sync_engine) as session:
        aliases = [normalize_object_name(a) for a in result.get("aliases", [])]
        if normalized not in aliases:
            aliases.append(normalized)

        target = Target(
            primary_name=result["primary_name"],
            aliases=aliases,
            ra=result.get("ra"),
            dec=result.get("dec"),
            object_type=result.get("object_type"),
        )
        try:
            session.add(target)
            session.commit()
            return str(target.id)
        except IntegrityError:
            session.rollback()
            # Another worker inserted this target — re-query
            stmt = select(Target).where(Target.primary_name == result["primary_name"])
            existing = session.execute(stmt).scalar_one_or_none()
            return str(existing.id) if existing else None
