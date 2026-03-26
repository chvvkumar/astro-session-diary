import logging
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Image, Target
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
from app.services.scan_state import increment_completed_sync, increment_failed_sync

_redis = get_sync_redis()


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
        target_id = None
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
        if self.request.retries >= self.max_retries:
            increment_failed_sync(_redis)
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
            increment_failed_sync(_redis)
        raise self.retry(exc=exc)


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
