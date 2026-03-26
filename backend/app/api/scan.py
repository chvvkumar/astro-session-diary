import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings, get_async_redis
from app.database import get_session
from app.models import Image, Target
from app.services.scanner import scan_directory
from app.services.scan_state import (
    get_scan_state, start_scanning, set_ingesting, set_idle,
)
from app.services.simbad import resolve_target_name, normalize_object_name
from app.worker.tasks import ingest_file, regenerate_thumbnail

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("")
async def trigger_scan(
    session: AsyncSession = Depends(get_session),
    include_calibration: bool = Query(True, description="Include calibration frames (BIAS, DARK, FLAT)"),
):
    """Walk the FITS directory, queue new files for ingestion."""
    r = get_async_redis()
    try:
        state = await get_scan_state(r)
        if state.state in ("scanning", "ingesting"):
            return {"status": "already_running", **state.to_dict()}

        await start_scanning(r)

        # Get known paths from DB
        result = await session.execute(select(Image.file_path))
        known_paths = {row[0] for row in result.all()}

        fits_root = Path(settings.fits_data_path)
        new_files = await asyncio.to_thread(
            lambda: list(scan_directory(fits_root, known_paths=known_paths, include_calibration=include_calibration))
        )

        if not new_files:
            await set_idle(r)
            return {
                "status": "complete",
                "new_files_queued": 0,
                "already_known": len(known_paths),
            }

        await set_ingesting(r, total=len(new_files))

        for fits_path in new_files:
            ingest_file.delay(str(fits_path))

        return {
            "status": "ingesting",
            "new_files_queued": len(new_files),
            "already_known": len(known_paths),
        }
    finally:
        await r.aclose()


@router.post("/regenerate-thumbnails")
async def regenerate_thumbnails(
    session: AsyncSession = Depends(get_session),
):
    """Queue all existing images for thumbnail regeneration."""
    r = get_async_redis()
    try:
        state = await get_scan_state(r)
        if state.state in ("scanning", "ingesting"):
            return {"status": "already_running", **state.to_dict()}

        await start_scanning(r)

        result = await session.execute(
            select(Image.id, Image.file_path, Image.thumbnail_path)
        )
        rows = result.all()

        if not rows:
            await set_idle(r)
            return {"status": "complete", "queued": 0}

        await set_ingesting(r, total=len(rows))

        for image_id, file_path, thumb_path in rows:
            if file_path and thumb_path:
                regenerate_thumbnail.delay(str(image_id), file_path, thumb_path)

        return {
            "status": "ingesting",
            "queued": len(rows),
            "message": "Regenerating all thumbnails with MTF stretch",
        }
    finally:
        await r.aclose()


@router.get("/status")
async def scan_status():
    """Return current scan state from Redis."""
    r = get_async_redis()
    try:
        state = await get_scan_state(r)
        return state.to_dict()
    finally:
        await r.aclose()


@router.post("/backfill-targets")
async def backfill_targets(
    session: AsyncSession = Depends(get_session),
):
    """Resolve targets for already-ingested images that have NULL resolved_target_id.

    Only queries SIMBAD once per unique object name with a 0.5s delay between
    requests to respect rate limits. Then bulk-updates all matching images.
    """
    # Step 1: Get distinct unresolved object names
    result = await session.execute(
        text("""
            SELECT raw_headers->>'OBJECT' AS obj, COUNT(*) AS cnt
            FROM images
            WHERE resolved_target_id IS NULL
              AND raw_headers->>'OBJECT' IS NOT NULL
              AND raw_headers->>'OBJECT' != ''
            GROUP BY raw_headers->>'OBJECT'
            ORDER BY cnt DESC
        """)
    )
    unresolved = result.all()

    if not unresolved:
        return {"status": "complete", "resolved": 0, "failed": 0, "images_updated": 0}

    resolved_count = 0
    failed_names = []
    total_images_updated = 0

    for object_name, image_count in unresolved:
        normalized = normalize_object_name(object_name)

        # Check if target already exists (from ongoing scan or previous backfill)
        existing = await session.execute(
            select(Target).where(Target.aliases.any(normalized))
        )
        target = existing.scalar_one_or_none()

        if not target:
            existing = await session.execute(
                select(Target).where(Target.primary_name == object_name)
            )
            target = existing.scalar_one_or_none()

        if not target:
            # Query SIMBAD
            simbad_result = await resolve_target_name(object_name)

            if simbad_result:
                # Check if SIMBAD primary_name already exists as a target
                existing = await session.execute(
                    select(Target).where(Target.primary_name == simbad_result["primary_name"])
                )
                target = existing.scalar_one_or_none()

                if not target:
                    aliases = [normalize_object_name(a) for a in simbad_result.get("aliases", [])]
                    if normalized not in aliases:
                        aliases.append(normalized)
                    target = Target(
                        primary_name=simbad_result["primary_name"],
                        aliases=aliases,
                        ra=simbad_result.get("ra"),
                        dec=simbad_result.get("dec"),
                        object_type=simbad_result.get("object_type"),
                    )
                    session.add(target)
                    await session.flush()  # get target.id
                else:
                    # Add this name as alias if not already present
                    if normalized not in target.aliases:
                        target.aliases = [*target.aliases, normalized]
                        await session.flush()

                # Rate limit: 0.5s between SIMBAD queries
                await asyncio.sleep(0.5)
            else:
                failed_names.append(object_name)
                logger.info("Backfill: SIMBAD found no match for '%s' (%d images)", object_name, image_count)
                await asyncio.sleep(0.5)
                continue

        # Bulk-update all images with this object name
        update_result = await session.execute(
            text("""
                UPDATE images
                SET resolved_target_id = :target_id
                WHERE resolved_target_id IS NULL
                  AND raw_headers->>'OBJECT' = :obj_name
            """),
            {"target_id": target.id, "obj_name": object_name},
        )
        updated = update_result.rowcount
        total_images_updated += updated
        resolved_count += 1
        logger.info(
            "Backfill: '%s' -> '%s' (%d images updated)",
            object_name, target.primary_name, updated,
        )

    await session.commit()

    return {
        "status": "complete",
        "unique_names_processed": len(unresolved),
        "resolved": resolved_count,
        "failed": len(failed_names),
        "failed_names": failed_names,
        "images_updated": total_images_updated,
    }
