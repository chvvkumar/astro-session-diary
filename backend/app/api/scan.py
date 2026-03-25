import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings, get_async_redis
from app.database import get_session
from app.models import Image
from app.services.scanner import scan_directory
from app.services.scan_state import (
    get_scan_state, start_scanning, set_ingesting, set_idle,
)
from app.worker.tasks import ingest_file

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("")
async def trigger_scan(
    session: AsyncSession = Depends(get_session),
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
            lambda: list(scan_directory(fits_root, known_paths=known_paths))
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


@router.get("/status")
async def scan_status():
    """Return current scan state from Redis."""
    r = get_async_redis()
    try:
        state = await get_scan_state(r)
        return state.to_dict()
    finally:
        await r.aclose()
