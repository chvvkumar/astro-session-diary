from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from celery.result import AsyncResult

from app.config import settings
from app.database import get_session
from app.models import Image
from app.services.scanner import scan_directory
from app.worker.tasks import ingest_file

router = APIRouter(prefix="/scan", tags=["scan"])

# In-memory scan state (simple approach; could use Redis for multi-worker)
_scan_state = {"running": False, "total": 0, "queued": 0}


@router.post("")
async def trigger_scan(
    session: AsyncSession = Depends(get_session),
):
    """Walk the FITS directory, queue new files for ingestion."""
    if _scan_state["running"]:
        return {"status": "already_running", **_scan_state}

    _scan_state["running"] = True
    _scan_state["total"] = 0
    _scan_state["queued"] = 0

    # Get known paths from DB
    result = await session.execute(select(Image.file_path))
    known_paths = {row[0] for row in result.all()}

    fits_root = Path(settings.fits_data_path)
    new_files = list(scan_directory(fits_root, known_paths=known_paths))
    _scan_state["total"] = len(new_files)

    for fits_path in new_files:
        ingest_file.delay(str(fits_path))
        _scan_state["queued"] += 1

    _scan_state["running"] = False

    return {
        "status": "complete",
        "new_files_queued": len(new_files),
        "already_known": len(known_paths),
    }


@router.get("/status")
async def scan_status():
    """Return current scan state."""
    return _scan_state
