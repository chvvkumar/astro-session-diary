"""Redis-backed scan state manager.

Keys used:
  scan:state   — hash with fields: state, total, completed, failed, started_at, completed_at
  scan:state is set to expire after 24h on completion so old results don't linger forever.
"""

import time
from dataclasses import dataclass

import redis.asyncio as aioredis
import redis as sync_redis

SCAN_KEY = "scan:state"
SCAN_PROGRESS_KEY = "scan:last_progress"
EXPIRE_AFTER_COMPLETE = 86400  # 24 hours
STALE_TIMEOUT = 300  # 5 minutes with no progress → consider stuck


@dataclass
class ScanStateSnapshot:
    state: str  # idle | scanning | ingesting | complete
    total: int
    completed: int
    failed: int
    started_at: float | None
    completed_at: float | None

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


def _parse_snapshot(data: dict | None) -> ScanStateSnapshot:
    if not data or "state" not in data:
        return ScanStateSnapshot(
            state="idle", total=0, completed=0, failed=0,
            started_at=None, completed_at=None,
        )
    return ScanStateSnapshot(
        state=data.get("state", "idle"),
        total=int(data.get("total", 0)),
        completed=int(data.get("completed", 0)),
        failed=int(data.get("failed", 0)),
        started_at=float(data["started_at"]) if data.get("started_at") else None,
        completed_at=float(data["completed_at"]) if data.get("completed_at") else None,
    )


# ── Async API (for FastAPI) ──────────────────────────────────────────────

async def get_scan_state(r: aioredis.Redis) -> ScanStateSnapshot:
    data = await r.hgetall(SCAN_KEY)
    snap = _parse_snapshot(data)
    # Detect stale ingestion: no progress for STALE_TIMEOUT seconds
    if snap.state in ("scanning", "ingesting"):
        last_progress = await r.get(SCAN_PROGRESS_KEY)
        if last_progress:
            elapsed = time.time() - float(last_progress)
            if elapsed > STALE_TIMEOUT:
                snap.state = "stalled"
    return snap


async def start_scanning(r: aioredis.Redis) -> None:
    await r.hset(SCAN_KEY, mapping={
        "state": "scanning",
        "total": 0,
        "completed": 0,
        "failed": 0,
        "started_at": time.time(),
        "completed_at": "",
    })
    await r.set(SCAN_PROGRESS_KEY, str(time.time()))
    await r.persist(SCAN_KEY)  # remove any previous TTL


async def set_ingesting(r: aioredis.Redis, total: int) -> None:
    await r.hset(SCAN_KEY, mapping={
        "state": "ingesting",
        "total": total,
    })


async def set_complete_if_done(r: aioredis.Redis) -> None:
    """Check if all tasks finished and transition to complete."""
    data = await r.hgetall(SCAN_KEY)
    snap = _parse_snapshot(data)
    if snap.state == "ingesting" and snap.total > 0 and (snap.completed + snap.failed) >= snap.total:
        await r.hset(SCAN_KEY, mapping={
            "state": "complete",
            "completed_at": time.time(),
        })
        await r.expire(SCAN_KEY, EXPIRE_AFTER_COMPLETE)


async def reset_scan(r: aioredis.Redis) -> None:
    """Force-clear scan state back to idle. Used when scan is stalled."""
    await r.delete(SCAN_KEY)
    await r.delete(SCAN_PROGRESS_KEY)


async def set_idle(r: aioredis.Redis) -> None:
    """Mark scan as complete with zero files (nothing to do)."""
    await r.hset(SCAN_KEY, mapping={
        "state": "complete",
        "total": 0,
        "completed_at": time.time(),
    })
    await r.expire(SCAN_KEY, EXPIRE_AFTER_COMPLETE)


# ── Sync API (for Celery worker) ─────────────────────────────────────────

def increment_completed_sync(r: sync_redis.Redis) -> None:
    r.hincrby(SCAN_KEY, "completed", 1)
    r.set(SCAN_PROGRESS_KEY, str(time.time()))
    _check_complete_sync(r)


def increment_failed_sync(r: sync_redis.Redis) -> None:
    r.hincrby(SCAN_KEY, "failed", 1)
    r.set(SCAN_PROGRESS_KEY, str(time.time()))
    _check_complete_sync(r)


def _check_complete_sync(r: sync_redis.Redis) -> None:
    data = r.hgetall(SCAN_KEY)
    snap = _parse_snapshot(data)
    if snap.state == "ingesting" and snap.total > 0 and (snap.completed + snap.failed) >= snap.total:
        r.hset(SCAN_KEY, mapping={
            "state": "complete",
            "completed_at": time.time(),
        })
        r.expire(SCAN_KEY, EXPIRE_AFTER_COMPLETE)


def start_scanning_sync(r: sync_redis.Redis) -> None:
    r.hset(SCAN_KEY, mapping={
        "state": "scanning",
        "total": 0,
        "completed": 0,
        "failed": 0,
        "started_at": time.time(),
        "completed_at": "",
    })
    r.set(SCAN_PROGRESS_KEY, str(time.time()))
    r.persist(SCAN_KEY)


def set_ingesting_sync(r: sync_redis.Redis, total: int) -> None:
    r.hset(SCAN_KEY, mapping={
        "state": "ingesting",
        "total": total,
    })


def set_idle_sync(r: sync_redis.Redis) -> None:
    r.hset(SCAN_KEY, mapping={
        "state": "complete",
        "total": 0,
        "completed_at": time.time(),
    })
    r.expire(SCAN_KEY, EXPIRE_AFTER_COMPLETE)
