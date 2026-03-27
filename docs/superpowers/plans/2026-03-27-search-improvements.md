# Search Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve collection sifting with fuzzy search, object type filtering, HFR quality filters, and duplicate target detection with merge management.

**Architecture:** Four independent features sharing one Alembic migration. Backend uses PostgreSQL `pg_trgm` for fuzzy matching (reused by search and duplicate detection). Frontend adds two new sidebar filter components and a settings tab for merge management. All new filters follow the existing persistence pattern (URL params > sessionStorage > defaults).

**Tech Stack:** PostgreSQL pg_trgm, SQLAlchemy async, FastAPI, Celery, SolidJS, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-27-search-improvements-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `backend/alembic/versions/0004_search_improvements.py` | Migration: pg_trgm extension, trigram index, merge columns, merge_candidates table |
| `backend/app/models/merge_candidate.py` | MergeCandidate ORM model |
| `backend/app/api/merges.py` | Merge/unmerge API endpoints + duplicate detection trigger |
| `frontend/src/components/ObjectTypeToggles.tsx` | Object type filter pills in sidebar |
| `frontend/src/components/QualityFilters.tsx` | HFR min/max range inputs in sidebar |
| `frontend/src/components/settings/MergesTab.tsx` | Merge management UI (suggestions + merged targets) |
| `backend/tests/test_fuzzy_search.py` | Tests for trigram search |
| `backend/tests/test_object_type_filter.py` | Tests for object type filtering |
| `backend/tests/test_quality_filter.py` | Tests for HFR session filtering |
| `backend/tests/test_merges.py` | Tests for merge/unmerge/detection |

### Modified Files
| File | Changes |
|------|---------|
| `backend/app/models/target.py` | Add `merged_into_id`, `merged_at` columns |
| `backend/app/models/__init__.py` | Export MergeCandidate |
| `backend/app/schemas/target.py` | Update TargetSearchResult, TargetAggregation; add ObjectTypeCount, merge schemas |
| `backend/app/api/targets.py` | Fuzzy search endpoint, object_type param, hfr_min/hfr_max params, object-types endpoint |
| `backend/app/api/router.py` | Register merges router |
| `backend/app/worker/tasks.py` | Add detect_duplicate_targets task |
| `frontend/src/types/index.ts` | New TS interfaces |
| `frontend/src/api/client.ts` | New API methods |
| `frontend/src/store/catalog.ts` | Add objectTypes, qualityFilters to ActiveFilters |
| `frontend/src/components/SearchBar.tsx` | Show match_source in dropdown |
| `frontend/src/components/Sidebar.tsx` | Add ObjectTypeToggles, QualityFilters |
| `frontend/src/components/TargetRow.tsx` | Show "N of M sessions" indicator |
| `frontend/src/pages/SettingsPage.tsx` | Add Merges tab |

---

## Task 1: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/0004_search_improvements.py`

- [ ] **Step 1: Create migration file**

```python
"""Search improvements: pg_trgm, trigram index, merge tracking, merge_candidates table."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pg_trgm extension for fuzzy search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Trigram GIN index on primary_name
    op.execute(
        "CREATE INDEX ix_targets_primary_name_trgm "
        "ON targets USING gin (primary_name gin_trgm_ops)"
    )

    # Merge tracking columns on targets
    op.add_column("targets", sa.Column("merged_into_id", UUID(as_uuid=True), nullable=True))
    op.add_column("targets", sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_targets_merged_into",
        "targets",
        "targets",
        ["merged_into_id"],
        ["id"],
    )

    # merge_candidates table
    op.create_table(
        "merge_candidates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source_name", sa.String(255), nullable=False),
        sa.Column("source_image_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("suggested_target_id", UUID(as_uuid=True), sa.ForeignKey("targets.id"), nullable=False),
        sa.Column("similarity_score", sa.Float, nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="'pending'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("merge_candidates")
    op.drop_constraint("fk_targets_merged_into", "targets", type_="foreignkey")
    op.drop_column("targets", "merged_at")
    op.drop_column("targets", "merged_into_id")
    op.execute("DROP INDEX IF EXISTS ix_targets_primary_name_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
```

- [ ] **Step 2: Run migration**

Run: `cd backend && alembic upgrade head`
Expected: Migration applies successfully, no errors.

- [ ] **Step 3: Verify migration applied**

Run: `cd backend && alembic current`
Expected: Shows revision `0004` as head.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0004_search_improvements.py
git commit -m "feat: add migration for search improvements (pg_trgm, merge tracking)"
```

---

## Task 2: Backend Models Update

**Files:**
- Modify: `backend/app/models/target.py`
- Create: `backend/app/models/merge_candidate.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write test for Target merge fields**

Create `backend/tests/test_merges.py`:

```python
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import get_session
from app.models import Target


def test_target_has_merge_fields():
    """Target model should have merged_into_id and merged_at columns."""
    t = MagicMock(spec=Target)
    assert hasattr(Target, "merged_into_id")
    assert hasattr(Target, "merged_at")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_merges.py::test_target_has_merge_fields -v`
Expected: FAIL — `merged_into_id` not found on Target.

- [ ] **Step 3: Update Target model**

In `backend/app/models/target.py`, add after the `object_type` field (line 18):

```python
import uuid
from datetime import datetime

from sqlalchemy import String, Float, Index, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Target(Base):
    __tablename__ = "targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    primary_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    ra: Mapped[float | None] = mapped_column(Float, nullable=True)
    dec: Mapped[float | None] = mapped_column(Float, nullable=True)
    object_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    merged_into_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("targets.id"), nullable=True
    )
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    images: Mapped[list["Image"]] = relationship(back_populates="target")

    __table_args__ = (
        Index("ix_targets_aliases", "aliases", postgresql_using="gin"),
    )
```

- [ ] **Step 4: Create MergeCandidate model**

Create `backend/app/models/merge_candidate.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import String, Float, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class MergeCandidate(Base):
    __tablename__ = "merge_candidates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_image_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    suggested_target_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("targets.id"), nullable=False
    )
    similarity_score: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 5: Update models __init__.py**

Add to `backend/app/models/__init__.py`:

```python
from .merge_candidate import MergeCandidate
```

Ensure `MergeCandidate` is exported alongside `Target` and `Image`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_merges.py::test_target_has_merge_fields -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/target.py backend/app/models/merge_candidate.py backend/app/models/__init__.py backend/tests/test_merges.py
git commit -m "feat: add merge tracking fields to Target and MergeCandidate model"
```

---

## Task 3: Backend Schemas Update

**Files:**
- Modify: `backend/app/schemas/target.py`

- [ ] **Step 1: Add new schema classes**

Add to the end of `backend/app/schemas/target.py`:

```python
class TargetSearchResultFuzzy(BaseModel):
    id: uuid.UUID
    primary_name: str
    object_type: str | None = None
    aliases: list[str] = []
    match_source: str | None = None
    similarity_score: float = 1.0


class ObjectTypeCount(BaseModel):
    object_type: str
    count: int


class MergeCandidateResponse(BaseModel):
    id: uuid.UUID
    source_name: str
    source_image_count: int
    suggested_target_id: uuid.UUID
    suggested_target_name: str
    similarity_score: float
    method: str
    status: str
    created_at: str


class MergedTargetResponse(BaseModel):
    id: uuid.UUID
    primary_name: str
    merged_into_id: uuid.UUID
    merged_into_name: str
    merged_at: str
    image_count: int


class MergeRequest(BaseModel):
    winner_id: uuid.UUID
    loser_id: uuid.UUID | None = None
    loser_name: str | None = None
```

- [ ] **Step 2: Update TargetAggregation to include session counts**

In `backend/app/schemas/target.py`, update the `TargetAggregation` class (lines 69-77):

```python
class TargetAggregation(BaseModel):
    target_id: str
    primary_name: str
    aliases: list[str] = []
    total_integration_seconds: float
    total_frames: int
    filter_distribution: dict[str, float]
    equipment: list[str]
    sessions: list[SessionSummary]
    matched_sessions: int | None = None
    total_sessions: int | None = None
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/target.py
git commit -m "feat: add schemas for fuzzy search, object types, quality filters, and merges"
```

---

## Task 4: Fuzzy Search Backend

**Files:**
- Modify: `backend/app/api/targets.py`
- Create: `backend/tests/test_fuzzy_search.py`

- [ ] **Step 1: Write failing test for fuzzy autocomplete**

Create `backend/tests/test_fuzzy_search.py`:

```python
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import get_session
from app.models import Target


@pytest.mark.asyncio
async def test_fuzzy_search_returns_match_source():
    """Fuzzy search should return match_source and similarity_score fields."""
    mock_target = MagicMock(spec=Target)
    mock_target.id = uuid.uuid4()
    mock_target.primary_name = "IC 434"
    mock_target.object_type = "EmissionNebula"
    mock_target.aliases = ["Horsehead Nebula", "IC 434"]
    mock_target.merged_into_id = None

    mock_result = MagicMock()
    mock_result.all.return_value = [(mock_target, "Horsehead Nebula", 0.6)]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/targets/search?q=Horshead")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert "match_source" in data[0]
    assert "similarity_score" in data[0]
    assert "aliases" in data[0]

    app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_fuzzy_search.py -v`
Expected: FAIL — current endpoint returns `TargetSearchResult` without `match_source`.

- [ ] **Step 3: Implement fuzzy search endpoint**

Replace the `search_targets` function in `backend/app/api/targets.py` (lines 26-46) with:

```python
from app.schemas.target import TargetSearchResultFuzzy

@router.get("/search", response_model=list[TargetSearchResultFuzzy])
async def search_targets(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Search targets by name or alias with fuzzy trigram matching."""
    pattern = f"%{q}%"

    # Tier 1: Exact substring matches (fast path) — exclude soft-deleted targets
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
        # Determine if match was on primary_name or alias
        match_source = None
        if q.upper() not in t.primary_name.upper():
            for alias in t.aliases:
                if q.upper() in alias.upper():
                    match_source = alias
                    break
        results.append(TargetSearchResultFuzzy(
            id=t.id,
            primary_name=t.primary_name,
            object_type=t.object_type,
            aliases=t.aliases,
            match_source=match_source,
            similarity_score=1.0,
        ))

    # Tier 2: Fuzzy trigram matches (if we need more results)
    if len(results) < limit:
        remaining = limit - len(results)
        # Search primary_name with trigram similarity
        fuzzy_query = (
            select(
                Target,
                func.greatest(
                    func.similarity(Target.primary_name, q),
                    func.coalesce(
                        select(func.max(func.similarity(func.unnest(Target.aliases), q))).correlate(Target).scalar_subquery(),
                        0,
                    ),
                ).label("score"),
            )
            .where(
                Target.merged_into_id.is_(None),
                Target.id.notin_(exact_ids) if exact_ids else True,
                or_(
                    func.similarity(Target.primary_name, q) > 0.15,
                    select(func.max(func.similarity(func.unnest(Target.aliases), q))).correlate(Target).scalar_subquery() > 0.15,
                ),
            )
            .order_by(text("score DESC"))
            .limit(remaining)
        )
        fuzzy_result = await session.execute(fuzzy_query)
        for target, score in fuzzy_result.all():
            # Find best matching alias
            match_source = None
            best_alias_score = 0
            for alias in target.aliases:
                # Approximate: check if alias similarity is better than primary_name
                if alias.upper() != target.primary_name.upper():
                    match_source = alias  # Will be refined by actual score
            primary_score = 0  # Will use DB score
            if match_source and score > func.similarity(target.primary_name, q):
                pass  # match_source stays as alias
            else:
                match_source = None  # Primary name was the best match

            results.append(TargetSearchResultFuzzy(
                id=target.id,
                primary_name=target.primary_name,
                object_type=target.object_type,
                aliases=target.aliases,
                match_source=match_source,
                similarity_score=float(score),
            ))

    return results
```

- [ ] **Step 4: Update the main list search filter to use trigram matching**

In `backend/app/api/targets.py`, in the `list_targets_aggregated` function, replace the `search` filter block (lines 230-238) with:

```python
    if search:
        pattern = f"%{search}%"
        base_filter.append(
            or_(
                Target.primary_name.ilike(pattern),
                func.similarity(Target.primary_name, search) > 0.15,
                Image.raw_headers["OBJECT"].astext.ilike(pattern),
            )
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_fuzzy_search.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/targets.py backend/tests/test_fuzzy_search.py
git commit -m "feat: implement fuzzy trigram search with alias matching"
```

---

## Task 5: Object Type Filter Backend

**Files:**
- Modify: `backend/app/api/targets.py`
- Create: `backend/tests/test_object_type_filter.py`

- [ ] **Step 1: Write failing test for object-types endpoint**

Create `backend/tests/test_object_type_filter.py`:

```python
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import get_session


@pytest.mark.asyncio
async def test_get_object_types():
    """GET /targets/object-types should return distinct types with counts."""
    mock_result = MagicMock()
    mock_result.all.return_value = [("Galaxy", 5), ("EmissionNebula", 3)]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/targets/object-types")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["object_type"] == "Galaxy"
    assert data[0]["count"] == 5

    app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_object_type_filter.py -v`
Expected: FAIL — 404 endpoint not found.

- [ ] **Step 3: Add object-types endpoint**

In `backend/app/api/targets.py`, add after the `get_fits_keys` endpoint (after line 79) and before the target detail route:

```python
from app.schemas.target import ObjectTypeCount

@router.get("/object-types", response_model=list[ObjectTypeCount])
async def get_object_types(
    session: AsyncSession = Depends(get_session),
    camera: str | None = Query(None),
    telescope: str | None = Query(None),
    filters: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    """Return distinct object types with target counts, respecting active filters."""
    filter_map, cam_map, tel_map = await load_alias_maps(session)

    conditions = [
        Target.object_type.isnot(None),
        Target.merged_into_id.is_(None),
        Image.image_type == "LIGHT",
    ]
    if camera:
        conditions.append(Image.camera.in_(expand_canonical(camera, cam_map)))
    if telescope:
        conditions.append(Image.telescope.in_(expand_canonical(telescope, tel_map)))
    if filters:
        all_variants = []
        for f in [f.strip() for f in filters.split(",")]:
            all_variants.extend(expand_canonical(f, filter_map))
        conditions.append(Image.filter_used.in_(all_variants))
    if date_from:
        conditions.append(Image.capture_date >= date_from)
    if date_to:
        conditions.append(Image.capture_date <= date_to)

    query = (
        select(Target.object_type, func.count(func.distinct(Target.id)).label("count"))
        .join(Image, Image.resolved_target_id == Target.id)
        .where(*conditions)
        .group_by(Target.object_type)
        .order_by(func.count(func.distinct(Target.id)).desc())
    )
    result = await session.execute(query)
    return [ObjectTypeCount(object_type=row[0], count=row[1]) for row in result.all()]
```

- [ ] **Step 4: Add object_type filter to list_targets_aggregated**

In `backend/app/api/targets.py`, add a new parameter to `list_targets_aggregated` and filter logic. Add parameter:

```python
    object_type: str | None = Query(None),
```

Add filter block after the `search` filter (around line 238):

```python
    if object_type:
        type_list = [t.strip() for t in object_type.split(",")]
        if "Unresolved" in type_list:
            type_list_clean = [t for t in type_list if t != "Unresolved"]
            if type_list_clean:
                base_filter.append(
                    or_(
                        Target.object_type.in_(type_list_clean),
                        Image.resolved_target_id.is_(None),
                    )
                )
            # If only "Unresolved", filter to unresolved images
            else:
                base_filter.append(Image.resolved_target_id.is_(None))
        else:
            base_filter.append(Target.object_type.in_(type_list))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_object_type_filter.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/targets.py backend/tests/test_object_type_filter.py
git commit -m "feat: add object type filtering endpoint and query param"
```

---

## Task 6: HFR Quality Filter Backend

**Files:**
- Modify: `backend/app/api/targets.py`
- Create: `backend/tests/test_quality_filter.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_quality_filter.py`:

```python
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import get_session


@pytest.mark.asyncio
async def test_hfr_filter_param_accepted():
    """GET /targets?hfr_max=2.0 should be accepted without error."""
    mock_result = MagicMock()
    mock_result.all.return_value = []

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/targets?hfr_max=2.0")

    assert resp.status_code == 200

    app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_quality_filter.py -v`
Expected: FAIL — 422 unprocessable entity (unknown query param in strict mode) or unexpected behavior.

- [ ] **Step 3: Add HFR filter parameters and session-level filtering**

In `backend/app/api/targets.py`, add parameters to `list_targets_aggregated`:

```python
    hfr_min: float | None = Query(None),
    hfr_max: float | None = Query(None),
```

Then modify the session grouping block (around line 316-329). Replace the session aggregation to also track median HFR per session. Update the session dict initialization:

```python
        if date_key not in sessions_map[tid]:
            sessions_map[tid][date_key] = {
                "session_date": date_key,
                "integration_seconds": 0,
                "frame_count": 0,
                "filters_set": set(),
                "hfr_values": [],
            }
        s = sessions_map[tid][date_key]
        s["integration_seconds"] += exp
        s["frame_count"] += 1
        if f:
            s["filters_set"].add(f)
        if image.median_hfr is not None:
            s["hfr_values"].append(image.median_hfr)
```

Then in the response assembly block (around line 331-353), add HFR session filtering:

```python
    import statistics

    target_list = []
    for tid, t in targets_map.items():
        all_sessions = sorted(sessions_map[tid].values(), key=lambda x: x["session_date"], reverse=True)
        total_session_count = len(all_sessions)

        # Apply HFR session-level filter
        if hfr_min is not None or hfr_max is not None:
            filtered_sessions = []
            for s in all_sessions:
                if not s["hfr_values"]:
                    continue  # skip sessions with no HFR data
                median_hfr = statistics.median(s["hfr_values"])
                if hfr_min is not None and median_hfr < hfr_min:
                    continue
                if hfr_max is not None and median_hfr > hfr_max:
                    continue
                filtered_sessions.append(s)
            matched_session_count = len(filtered_sessions)
            if matched_session_count == 0:
                continue  # skip target entirely
            build_sessions = filtered_sessions
        else:
            build_sessions = all_sessions
            matched_session_count = None

        sessions = []
        for s in build_sessions:
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
            matched_sessions=matched_session_count,
            total_sessions=total_session_count if matched_session_count is not None else None,
        ))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_quality_filter.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/targets.py backend/tests/test_quality_filter.py
git commit -m "feat: add session-level HFR quality filtering to targets endpoint"
```

---

## Task 7: Merge/Unmerge API Endpoints

**Files:**
- Create: `backend/app/api/merges.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Write failing test for merge endpoint**

Add to `backend/tests/test_merges.py`:

```python
@pytest.mark.asyncio
async def test_merge_endpoint_exists():
    """POST /api/targets/merge should exist."""
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    mock_session.commit = AsyncMock()

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/targets/merge",
            json={"winner_id": str(uuid.uuid4()), "loser_id": str(uuid.uuid4())},
        )

    # 404 means endpoint doesn't exist; we want anything else
    assert resp.status_code != 404

    app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_merges.py::test_merge_endpoint_exists -v`
Expected: FAIL — 404 not found.

- [ ] **Step 3: Create merges API module**

Create `backend/app/api/merges.py`:

```python
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.target import Target
from app.models.image import Image
from app.models.merge_candidate import MergeCandidate
from app.schemas.target import (
    MergeCandidateResponse,
    MergedTargetResponse,
    MergeRequest,
)

router = APIRouter(prefix="/targets", tags=["merges"])


@router.post("/merge")
async def merge_targets(
    body: MergeRequest,
    session: AsyncSession = Depends(get_session),
):
    """Merge a loser target into a winner target."""
    # Load winner
    winner = await session.get(Target, body.winner_id)
    if not winner:
        raise HTTPException(404, "Winner target not found")

    if body.loser_id:
        # Merge resolved target into winner
        loser = await session.get(Target, body.loser_id)
        if not loser:
            raise HTTPException(404, "Loser target not found")

        # Move all images from loser to winner
        await session.execute(
            update(Image)
            .where(Image.resolved_target_id == loser.id)
            .values(resolved_target_id=winner.id)
        )

        # Merge aliases (deduped)
        combined = set(winner.aliases) | set(loser.aliases) | {loser.primary_name}
        winner.aliases = sorted(combined)

        # Soft-delete loser
        loser.merged_into_id = winner.id
        loser.merged_at = datetime.now(timezone.utc)

        # Update merge candidates
        await session.execute(
            update(MergeCandidate)
            .where(
                MergeCandidate.suggested_target_id == winner.id,
                MergeCandidate.source_name == loser.primary_name,
            )
            .values(status="accepted", resolved_at=datetime.now(timezone.utc))
        )

    elif body.loser_name:
        # Merge unresolved obj: name into winner
        name = body.loser_name

        # Add name as alias to winner
        if name not in winner.aliases:
            winner.aliases = sorted(set(winner.aliases) | {name})

        # Resolve all images with this OBJECT name
        result = await session.execute(
            select(Image).where(
                Image.resolved_target_id.is_(None),
                Image.raw_headers["OBJECT"].astext == name,
            )
        )
        images = result.scalars().all()
        for img in images:
            img.resolved_target_id = winner.id

        # Update merge candidates
        await session.execute(
            update(MergeCandidate)
            .where(
                MergeCandidate.source_name == name,
                MergeCandidate.suggested_target_id == winner.id,
            )
            .values(status="accepted", resolved_at=datetime.now(timezone.utc))
        )
    else:
        raise HTTPException(400, "Must provide either loser_id or loser_name")

    await session.commit()
    return {"status": "merged"}


@router.post("/{target_id}/unmerge")
async def unmerge_target(
    target_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Restore a soft-deleted target that was merged."""
    loser = await session.get(Target, target_id)
    if not loser:
        raise HTTPException(404, "Target not found")
    if not loser.merged_into_id:
        raise HTTPException(400, "Target is not merged")

    winner = await session.get(Target, loser.merged_into_id)

    # Reassign images back: images whose OBJECT header matches loser's aliases
    loser_names = set(loser.aliases) | {loser.primary_name}
    result = await session.execute(
        select(Image).where(Image.resolved_target_id == winner.id)
    )
    for img in result.scalars().all():
        obj_name = (img.raw_headers or {}).get("OBJECT", "")
        if obj_name in loser_names:
            img.resolved_target_id = loser.id

    # Remove loser's aliases from winner
    if winner:
        winner.aliases = sorted(set(winner.aliases) - loser_names)

    # Restore loser
    loser.merged_into_id = None
    loser.merged_at = None

    # Reset merge candidates
    await session.execute(
        update(MergeCandidate)
        .where(
            MergeCandidate.source_name.in_(loser_names),
            MergeCandidate.suggested_target_id == winner.id,
        )
        .values(status="pending", resolved_at=None)
    )

    await session.commit()
    return {"status": "unmerged"}


@router.get("/merge-candidates", response_model=list[MergeCandidateResponse])
async def get_merge_candidates(
    status: str = Query("pending"),
    session: AsyncSession = Depends(get_session),
):
    """List merge candidates filtered by status."""
    query = (
        select(MergeCandidate, Target.primary_name.label("suggested_name"))
        .join(Target, MergeCandidate.suggested_target_id == Target.id)
        .where(MergeCandidate.status == status)
        .order_by(MergeCandidate.similarity_score.desc())
    )
    result = await session.execute(query)
    return [
        MergeCandidateResponse(
            id=mc.id,
            source_name=mc.source_name,
            source_image_count=mc.source_image_count,
            suggested_target_id=mc.suggested_target_id,
            suggested_target_name=name,
            similarity_score=mc.similarity_score,
            method=mc.method,
            status=mc.status,
            created_at=mc.created_at.isoformat(),
        )
        for mc, name in result.all()
    ]


@router.get("/merge-candidates/count")
async def get_merge_candidate_count(
    session: AsyncSession = Depends(get_session),
):
    """Return count of pending merge candidates (for notification badge)."""
    result = await session.execute(
        select(func.count(MergeCandidate.id)).where(MergeCandidate.status == "pending")
    )
    return {"count": result.scalar_one()}


@router.get("/merged-targets", response_model=list[MergedTargetResponse])
async def get_merged_targets(
    session: AsyncSession = Depends(get_session),
):
    """List all soft-deleted (merged) targets."""
    winner_alias = Target.__table__.alias("winner")
    query = (
        select(
            Target,
            select(winner_alias.c.primary_name)
            .where(winner_alias.c.id == Target.merged_into_id)
            .correlate(Target)
            .scalar_subquery()
            .label("merged_into_name"),
            select(func.count(Image.id))
            .where(Image.resolved_target_id == Target.merged_into_id)
            .correlate(Target)
            .scalar_subquery()
            .label("image_count"),
        )
        .where(Target.merged_into_id.isnot(None))
        .order_by(Target.merged_at.desc())
    )
    result = await session.execute(query)
    return [
        MergedTargetResponse(
            id=t.id,
            primary_name=t.primary_name,
            merged_into_id=t.merged_into_id,
            merged_into_name=name or "Unknown",
            merged_at=t.merged_at.isoformat() if t.merged_at else "",
            image_count=count or 0,
        )
        for t, name, count in result.all()
    ]


@router.post("/merge-candidates/{candidate_id}/dismiss")
async def dismiss_merge_candidate(
    candidate_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Dismiss a merge candidate so it doesn't reappear."""
    candidate = await session.get(MergeCandidate, candidate_id)
    if not candidate:
        raise HTTPException(404, "Candidate not found")
    candidate.status = "dismissed"
    candidate.resolved_at = datetime.now(timezone.utc)
    await session.commit()
    return {"status": "dismissed"}
```

- [ ] **Step 4: Register router**

In `backend/app/api/router.py`, add:

```python
from app.api.merges import router as merges_router

api_router.include_router(merges_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_merges.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/merges.py backend/app/api/router.py backend/tests/test_merges.py
git commit -m "feat: add merge/unmerge API endpoints and merge candidate management"
```

---

## Task 8: Duplicate Detection Celery Task

**Files:**
- Modify: `backend/app/worker/tasks.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_merges.py`:

```python
from app.worker.tasks import detect_duplicate_targets


def test_detect_duplicate_targets_task_exists():
    """The detect_duplicate_targets Celery task should be importable."""
    assert callable(detect_duplicate_targets)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_merges.py::test_detect_duplicate_targets_task_exists -v`
Expected: FAIL — ImportError.

- [ ] **Step 3: Implement detection task**

Add to `backend/app/worker/tasks.py` after the `regenerate_thumbnail` task (after line 196):

```python
@celery_app.task(name="detect_duplicate_targets")
def detect_duplicate_targets():
    """Detect potential duplicate targets by comparing unresolved names against resolved targets."""
    from sqlalchemy import create_engine, text, select, func
    from sqlalchemy.orm import Session as SyncSession
    from app.config import settings
    from app.models.target import Target
    from app.models.image import Image
    from app.models.merge_candidate import MergeCandidate

    sync_url = settings.database_url.replace("+asyncpg", "")
    engine = create_engine(sync_url)

    with SyncSession(engine) as session:
        # Find distinct unresolved OBJECT names with image counts
        unresolved_query = (
            select(
                Image.raw_headers["OBJECT"].astext.label("object_name"),
                func.count(Image.id).label("img_count"),
            )
            .where(
                Image.resolved_target_id.is_(None),
                Image.image_type == "LIGHT",
                Image.raw_headers["OBJECT"].astext.isnot(None),
            )
            .group_by(Image.raw_headers["OBJECT"].astext)
        )
        unresolved = session.execute(unresolved_query).all()

        if not unresolved:
            return {"candidates_found": 0}

        # Get existing pending/accepted candidates to avoid duplicates
        existing = session.execute(
            select(MergeCandidate.source_name).where(
                MergeCandidate.status.in_(["pending", "accepted"])
            )
        )
        existing_names = {row[0] for row in existing.all()}

        candidates_found = 0

        for obj_name, img_count in unresolved:
            if not obj_name or obj_name in existing_names:
                continue

            # Try SIMBAD re-resolution
            import asyncio
            from app.services.simbad import resolve_target_name

            simbad_result = asyncio.get_event_loop().run_until_complete(
                resolve_target_name(obj_name)
            ) if obj_name.upper() not in _simbad_negative_cache else None

            if simbad_result:
                # Check if SIMBAD name matches an existing target
                match = session.execute(
                    select(Target).where(
                        Target.merged_into_id.is_(None),
                        Target.primary_name == simbad_result["primary_name"],
                    )
                ).scalar_one_or_none()

                if match:
                    session.add(MergeCandidate(
                        source_name=obj_name,
                        source_image_count=img_count,
                        suggested_target_id=match.id,
                        similarity_score=1.0,
                        method="simbad",
                    ))
                    candidates_found += 1
                    continue

            # Trigram similarity search against all resolved target aliases
            trgm_query = text("""
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
            result = session.execute(trgm_query, {"name": obj_name}).first()

            if result:
                target_id, target_name, score = result
                session.add(MergeCandidate(
                    source_name=obj_name,
                    source_image_count=img_count,
                    suggested_target_id=target_id,
                    similarity_score=float(score),
                    method="trigram",
                ))
                candidates_found += 1

        session.commit()

    return {"candidates_found": candidates_found}
```

- [ ] **Step 4: Trigger detection after scan completes**

In `backend/app/worker/tasks.py`, at the end of the `run_scan` task (around line 65, after queuing ingest tasks), add:

```python
    # Queue duplicate detection after ingest tasks are likely complete
    detect_duplicate_targets.apply_async(countdown=30)
```

- [ ] **Step 5: Add API trigger endpoint**

Add to `backend/app/api/merges.py`:

```python
@router.post("/detect-duplicates")
async def trigger_duplicate_detection():
    """Manually trigger duplicate target detection."""
    from app.worker.tasks import detect_duplicate_targets
    task = detect_duplicate_targets.delay()
    return {"status": "queued", "task_id": task.id}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_merges.py::test_detect_duplicate_targets_task_exists -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/worker/tasks.py backend/app/api/merges.py backend/tests/test_merges.py
git commit -m "feat: add duplicate target detection Celery task with SIMBAD + trigram matching"
```

---

## Task 9: Frontend Types and API Client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add new TypeScript interfaces**

Add to `frontend/src/types/index.ts` after the `TargetSearchResult` interface (after line 173):

```typescript
export interface TargetSearchResultFuzzy {
  id: string;
  primary_name: string;
  object_type: string | null;
  aliases: string[];
  match_source: string | null;
  similarity_score: number;
}

export interface ObjectTypeCount {
  object_type: string;
  count: number;
}

export interface MergeCandidateResponse {
  id: string;
  source_name: string;
  source_image_count: number;
  suggested_target_id: string;
  suggested_target_name: string;
  similarity_score: number;
  method: string;
  status: string;
  created_at: string;
}

export interface MergedTargetResponse {
  id: string;
  primary_name: string;
  merged_into_id: string;
  merged_into_name: string;
  merged_at: string;
  image_count: number;
}
```

- [ ] **Step 2: Update TargetAggregation interface**

In `frontend/src/types/index.ts`, add to the `TargetAggregation` interface (after line 18):

```typescript
  matched_sessions?: number | null;
  total_sessions?: number | null;
```

- [ ] **Step 3: Update ActiveFilters interface**

In `frontend/src/types/index.ts`, update `ActiveFilters` (lines 131-138):

```typescript
export interface ActiveFilters {
  searchQuery: string;
  camera: string | null;
  telescope: string | null;
  opticalFilters: string[];
  objectTypes: string[];
  dateRange: { start: string | null; end: string | null };
  fitsQueries: { key: string; operator: string; value: string }[];
  qualityFilters: { hfrMin?: number; hfrMax?: number };
}
```

- [ ] **Step 4: Add new API client methods**

In `frontend/src/api/client.ts`, add imports for new types at the top:

```typescript
import type {
  TargetAggregationResponse,
  SessionDetail,
  EquipmentList,
  TargetSearchResult,
  TargetSearchResultFuzzy,
  ObjectTypeCount,
  MergeCandidateResponse,
  MergedTargetResponse,
  ScanResult,
  ScanStatus,
  ActiveFilters,
  StatsResponse,
  TargetDetailResponse,
  SettingsResponse,
  GeneralSettings,
  FilterConfig,
  EquipmentConfig,
  SuggestionsResponse,
  DiscoveredResponse,
} from "../types";
```

Update `buildTargetQuery` to include new filter params (replace lines 32-48):

```typescript
function buildTargetQuery(filters: ActiveFilters): string {
  const params = new URLSearchParams();
  if (filters.searchQuery) params.set("search", filters.searchQuery);
  if (filters.camera) params.set("camera", filters.camera);
  if (filters.telescope) params.set("telescope", filters.telescope);
  if (filters.opticalFilters.length > 0) {
    params.set("filters", filters.opticalFilters.join(","));
  }
  if (filters.objectTypes.length > 0) {
    params.set("object_type", filters.objectTypes.join(","));
  }
  if (filters.dateRange.start) params.set("date_from", filters.dateRange.start);
  if (filters.dateRange.end) params.set("date_to", filters.dateRange.end);
  if (filters.qualityFilters.hfrMin != null) {
    params.set("hfr_min", String(filters.qualityFilters.hfrMin));
  }
  if (filters.qualityFilters.hfrMax != null) {
    params.set("hfr_max", String(filters.qualityFilters.hfrMax));
  }
  for (const fq of filters.fitsQueries) {
    params.append("fits_key", fq.key);
    params.append("fits_op", fq.operator);
    params.append("fits_val", fq.value);
  }
  return params.toString();
}
```

Update `searchTargets` method (replace line 66-67):

```typescript
  searchTargets: (query: string) =>
    fetchJson<TargetSearchResultFuzzy[]>(`/targets/search?q=${encodeURIComponent(query)}`),
```

Add new methods before the closing brace of `api` (before line 140):

```typescript
  getObjectTypes: () =>
    fetchJson<ObjectTypeCount[]>("/targets/object-types"),

  getMergeCandidates: (status = "pending") =>
    fetchJson<MergeCandidateResponse[]>(`/targets/merge-candidates?status=${status}`),

  getMergeCandidateCount: () =>
    fetchJson<{ count: number }>("/targets/merge-candidates/count"),

  getMergedTargets: () =>
    fetchJson<MergedTargetResponse[]>("/targets/merged-targets"),

  mergeTargets: (winnerId: string, loserId?: string, loserName?: string) =>
    fetchJson<{ status: string }>("/targets/merge", {
      method: "POST",
      body: JSON.stringify({
        winner_id: winnerId,
        ...(loserId ? { loser_id: loserId } : {}),
        ...(loserName ? { loser_name: loserName } : {}),
      }),
    }),

  unmergeTarget: (targetId: string) =>
    fetchJson<{ status: string }>(`/targets/${encodeURIComponent(targetId)}/unmerge`, {
      method: "POST",
    }),

  dismissMergeCandidate: (candidateId: string) =>
    fetchJson<{ status: string }>(`/targets/merge-candidates/${candidateId}/dismiss`, {
      method: "POST",
    }),

  triggerDuplicateDetection: () =>
    fetchJson<{ status: string; task_id: string }>("/targets/detect-duplicates", {
      method: "POST",
    }),
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "feat: add frontend types and API client methods for search improvements"
```

---

## Task 10: Update Catalog Store

**Files:**
- Modify: `frontend/src/store/catalog.ts`

- [ ] **Step 1: Update default filters and persistence**

In `frontend/src/store/catalog.ts`, update `defaultFilters` (lines 7-14):

```typescript
const defaultFilters: ActiveFilters = {
  searchQuery: "",
  camera: null,
  telescope: null,
  opticalFilters: [],
  objectTypes: [],
  dateRange: { start: null, end: null },
  fitsQueries: [],
  qualityFilters: {},
};
```

- [ ] **Step 2: Update filtersToParams**

In `frontend/src/store/catalog.ts`, update `filtersToParams` (lines 20-34):

```typescript
function filtersToParams(f: ActiveFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.searchQuery) p.search = f.searchQuery;
  if (f.camera) p.camera = f.camera;
  if (f.telescope) p.telescope = f.telescope;
  if (f.opticalFilters.length > 0) p.filters = f.opticalFilters.join(",");
  if (f.objectTypes.length > 0) p.object_type = f.objectTypes.join(",");
  if (f.dateRange.start) p.date_from = f.dateRange.start;
  if (f.dateRange.end) p.date_to = f.dateRange.end;
  if (f.qualityFilters.hfrMin != null) p.hfr_min = String(f.qualityFilters.hfrMin);
  if (f.qualityFilters.hfrMax != null) p.hfr_max = String(f.qualityFilters.hfrMax);
  if (f.fitsQueries.length > 0) {
    p.fits_key = f.fitsQueries.map((q) => q.key).join(",");
    p.fits_op = f.fitsQueries.map((q) => q.operator).join(",");
    p.fits_val = f.fitsQueries.map((q) => q.value).join(",");
  }
  return p;
}
```

- [ ] **Step 3: Update paramsToFilters**

In `frontend/src/store/catalog.ts`, update `paramsToFilters` (lines 36-61):

```typescript
function paramsToFilters(params: URLSearchParams): ActiveFilters | null {
  const keys = ["search", "camera", "telescope", "filters", "object_type", "date_from", "date_to", "fits_key", "hfr_min", "hfr_max"];
  if (!keys.some((k) => params.has(k))) return null;

  const fitsKeys = params.get("fits_key")?.split(",") ?? [];
  const fitsOps = params.get("fits_op")?.split(",") ?? [];
  const fitsVals = params.get("fits_val")?.split(",") ?? [];
  const fitsQueries = fitsKeys.map((key, i) => ({
    key,
    operator: fitsOps[i] ?? "eq",
    value: fitsVals[i] ?? "",
  }));

  const qualityFilters: { hfrMin?: number; hfrMax?: number } = {};
  const hfrMin = params.get("hfr_min");
  const hfrMax = params.get("hfr_max");
  if (hfrMin) qualityFilters.hfrMin = parseFloat(hfrMin);
  if (hfrMax) qualityFilters.hfrMax = parseFloat(hfrMax);

  return {
    searchQuery: params.get("search") ?? "",
    camera: params.get("camera") || null,
    telescope: params.get("telescope") || null,
    opticalFilters: params.get("filters")?.split(",").filter(Boolean) ?? [],
    objectTypes: params.get("object_type")?.split(",").filter(Boolean) ?? [],
    dateRange: {
      start: params.get("date_from") || null,
      end: params.get("date_to") || null,
    },
    fitsQueries,
    qualityFilters,
  };
}
```

- [ ] **Step 4: Add toggleObjectType helper to useCatalog**

In `frontend/src/store/catalog.ts`, add to the `useCatalog()` return object (after `toggleOpticalFilter`):

```typescript
    toggleObjectType: (t: string) => {
      setFilters((prev) => {
        const current = prev.objectTypes;
        const next = current.includes(t)
          ? current.filter((x) => x !== t)
          : [...current, t];
        return { ...prev, objectTypes: next };
      });
    },

    updateQualityFilters: (qf: { hfrMin?: number; hfrMax?: number }) => {
      setFilters((prev) => ({ ...prev, qualityFilters: qf }));
    },
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/catalog.ts
git commit -m "feat: add objectTypes and qualityFilters to catalog store with URL persistence"
```

---

## Task 11: SearchBar Fuzzy Display

**Files:**
- Modify: `frontend/src/components/SearchBar.tsx`

- [ ] **Step 1: Update SearchBar to show match source**

Replace entire `frontend/src/components/SearchBar.tsx`:

```typescript
import { Component, createSignal, For, Show } from "solid-js";
import { api } from "../api/client";
import { useCatalog } from "../store/catalog";
import type { TargetSearchResultFuzzy } from "../types";

const SearchBar: Component = () => {
  const { updateFilter } = useCatalog();
  const [query, setQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<TargetSearchResultFuzzy[]>([]);
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

  const selectTarget = (target: TargetSearchResultFuzzy) => {
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
                <Show when={target.match_source}>
                  <span class="text-astro-accent text-xs ml-2">
                    matched: {target.match_source}
                  </span>
                </Show>
                <Show when={target.similarity_score < 1.0}>
                  <span class="text-astro-muted text-xs ml-1">
                    ~{Math.round(target.similarity_score * 100)}%
                  </span>
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SearchBar.tsx
git commit -m "feat: show fuzzy match source and similarity score in search dropdown"
```

---

## Task 12: ObjectTypeToggles Component

**Files:**
- Create: `frontend/src/components/ObjectTypeToggles.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Create ObjectTypeToggles component**

Create `frontend/src/components/ObjectTypeToggles.tsx`:

```typescript
import { Component, For, Show, createResource } from "solid-js";
import { useCatalog } from "../store/catalog";
import { api } from "../api/client";

const ObjectTypeToggles: Component = () => {
  const { filters, toggleObjectType } = useCatalog();
  const [objectTypes] = createResource(filters, () => api.getObjectTypes());

  const isActive = (t: string) => filters().objectTypes.includes(t);

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Object Type</label>
      <Show when={objectTypes() && objectTypes()!.length > 0}>
        <div class="flex gap-1.5 flex-wrap">
          <For each={objectTypes()}>
            {(item) => (
              <button
                onClick={() => toggleObjectType(item.object_type)}
                class={`px-1.5 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                  isActive(item.object_type)
                    ? "ring-2 ring-white/50 brightness-110 bg-astro-accent text-black"
                    : "bg-gray-700 text-astro-muted hover:brightness-110"
                }`}
                title={`${item.object_type} (${item.count})`}
              >
                {item.object_type}
                <span class="ml-1 opacity-60">{item.count}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ObjectTypeToggles;
```

- [ ] **Step 2: Add to Sidebar**

In `frontend/src/components/Sidebar.tsx`, add import and component:

```typescript
import { Component } from "solid-js";
import { useCatalog } from "../store/catalog";
import SearchBar from "./SearchBar";
import ObjectTypeToggles from "./ObjectTypeToggles";
import DateRangePicker from "./DateRangePicker";
import FilterToggles from "./FilterToggles";
import HardwareSelects from "./HardwareSelects";
import QualityFilters from "./QualityFilters";
import FitsQueryBuilder from "./FitsQueryBuilder";

const Sidebar: Component = () => {
  const { resetFilters } = useCatalog();

  return (
    <aside class="w-72 min-h-[calc(100vh-57px)] border-r border-[#2d2d2d] p-4 space-y-6 overflow-y-auto">
      <SearchBar />
      <ObjectTypeToggles />
      <DateRangePicker />
      <FilterToggles />
      <HardwareSelects />
      <QualityFilters />
      <FitsQueryBuilder />
      <button
        onClick={resetFilters}
        class="w-full py-2 text-xs text-astro-muted hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors"
      >
        Reset Filters
      </button>
    </aside>
  );
};

export default Sidebar;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ObjectTypeToggles.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: add object type filter toggles to sidebar"
```

---

## Task 13: QualityFilters Component

**Files:**
- Create: `frontend/src/components/QualityFilters.tsx`

- [ ] **Step 1: Create QualityFilters component**

Create `frontend/src/components/QualityFilters.tsx`:

```typescript
import { Component, createSignal, createEffect } from "solid-js";
import { useCatalog } from "../store/catalog";

const QualityFilters: Component = () => {
  const { filters, updateQualityFilters } = useCatalog();
  const [hfrMin, setHfrMin] = createSignal<string>("");
  const [hfrMax, setHfrMax] = createSignal<string>("");

  let debounceTimer: ReturnType<typeof setTimeout>;

  // Sync from store on init
  createEffect(() => {
    const qf = filters().qualityFilters;
    if (qf.hfrMin != null) setHfrMin(String(qf.hfrMin));
    if (qf.hfrMax != null) setHfrMax(String(qf.hfrMax));
  });

  const applyFilters = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const min = hfrMin() ? parseFloat(hfrMin()) : undefined;
      const max = hfrMax() ? parseFloat(hfrMax()) : undefined;
      updateQualityFilters({
        hfrMin: min && !isNaN(min) ? min : undefined,
        hfrMax: max && !isNaN(max) ? max : undefined,
      });
    }, 500);
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Quality (HFR)</label>
      <div class="flex gap-2 items-center">
        <input
          type="number"
          step="0.1"
          min="0"
          value={hfrMin()}
          onInput={(e) => {
            setHfrMin(e.currentTarget.value);
            applyFilters();
          }}
          placeholder="Min"
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white placeholder-astro-muted focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <span class="text-astro-muted text-xs">–</span>
        <input
          type="number"
          step="0.1"
          min="0"
          value={hfrMax()}
          onInput={(e) => {
            setHfrMax(e.currentTarget.value);
            applyFilters();
          }}
          placeholder="Max"
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white placeholder-astro-muted focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
      </div>
    </div>
  );
};

export default QualityFilters;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/QualityFilters.tsx
git commit -m "feat: add HFR quality filter component to sidebar"
```

---

## Task 14: TargetRow Session Count Indicator

**Files:**
- Modify: `frontend/src/components/TargetRow.tsx`

- [ ] **Step 1: Add "N of M sessions" indicator**

In `frontend/src/components/TargetRow.tsx`, add a session count indicator after the last session date cell (after line 58):

```typescript
        <td class="py-2.5 px-3 text-astro-accent text-xs">{lastSession()}</td>
        <Show when={props.target.matched_sessions != null}>
          <td class="py-2.5 px-3 text-xs text-yellow-400">
            {props.target.matched_sessions} of {props.target.total_sessions} sessions
          </td>
        </Show>
```

Note: The `<Show>` block only renders when HFR quality filters are active (i.e., `matched_sessions` is non-null). When no quality filters are active, the column doesn't appear and the table layout stays unchanged.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TargetRow.tsx
git commit -m "feat: show matched vs total session count when quality filters active"
```

---

## Task 15: MergesTab Settings Component

**Files:**
- Create: `frontend/src/components/settings/MergesTab.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create MergesTab component**

Create `frontend/src/components/settings/MergesTab.tsx`:

```typescript
import { Component, For, Show, createSignal, onMount } from "solid-js";
import { api } from "../../api/client";
import { showToast } from "../Toast";
import type { MergeCandidateResponse, MergedTargetResponse } from "../../types";

export const MergesTab: Component = () => {
  const [candidates, setCandidates] = createSignal<MergeCandidateResponse[]>([]);
  const [merged, setMerged] = createSignal<MergedTargetResponse[]>([]);
  const [detecting, setDetecting] = createSignal(false);
  const [view, setView] = createSignal<"suggestions" | "merged">("suggestions");

  const refresh = async () => {
    try {
      const [c, m] = await Promise.all([
        api.getMergeCandidates(),
        api.getMergedTargets(),
      ]);
      setCandidates(c);
      setMerged(m);
    } catch {
      // Non-blocking
    }
  };

  onMount(refresh);

  const handleMerge = async (candidate: MergeCandidateResponse) => {
    try {
      await api.mergeTargets(
        candidate.suggested_target_id,
        undefined,
        candidate.source_name,
      );
      showToast(`Merged "${candidate.source_name}" into "${candidate.suggested_target_name}"`);
      await refresh();
    } catch {
      showToast("Merge failed", "error");
    }
  };

  const handleDismiss = async (candidate: MergeCandidateResponse) => {
    try {
      await api.dismissMergeCandidate(candidate.id);
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
    } catch {
      showToast("Dismiss failed", "error");
    }
  };

  const handleUnmerge = async (target: MergedTargetResponse) => {
    try {
      await api.unmergeTarget(target.id);
      showToast(`Unmerged "${target.primary_name}"`);
      await refresh();
    } catch {
      showToast("Unmerge failed", "error");
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      await api.triggerDuplicateDetection();
      showToast("Duplicate detection started — results will appear shortly");
      // Poll for results after a delay
      setTimeout(refresh, 5000);
    } catch {
      showToast("Failed to start detection", "error");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div class="space-y-6">
      {/* Tab toggle */}
      <div class="flex gap-2 items-center">
        <button
          onClick={() => setView("suggestions")}
          class={`px-3 py-1 text-sm rounded ${
            view() === "suggestions" ? "bg-astro-accent text-white" : "bg-gray-700 text-astro-muted"
          }`}
        >
          Suggestions ({candidates().length})
        </button>
        <button
          onClick={() => setView("merged")}
          class={`px-3 py-1 text-sm rounded ${
            view() === "merged" ? "bg-astro-accent text-white" : "bg-gray-700 text-astro-muted"
          }`}
        >
          Merged ({merged().length})
        </button>
        <button
          onClick={handleDetect}
          disabled={detecting()}
          class="ml-auto px-3 py-1 text-sm bg-gray-700 text-astro-muted hover:text-white rounded disabled:opacity-50"
        >
          {detecting() ? "Detecting..." : "Run Detection"}
        </button>
      </div>

      {/* Suggestions view */}
      <Show when={view() === "suggestions"}>
        <Show
          when={candidates().length > 0}
          fallback={<p class="text-sm text-astro-muted">No pending suggestions. Run detection to scan for duplicates.</p>}
        >
          <div class="space-y-2">
            <For each={candidates()}>
              {(c) => (
                <div class="flex items-center justify-between p-3 bg-astro-dark border border-gray-700 rounded">
                  <div class="flex-1">
                    <span class="text-white text-sm font-medium">{c.source_name}</span>
                    <span class="text-astro-muted text-xs mx-2">&rarr;</span>
                    <span class="text-astro-accent text-sm">{c.suggested_target_name}</span>
                    <div class="text-xs text-astro-muted mt-0.5">
                      {c.method === "simbad" ? "SIMBAD confirmed" : `${Math.round(c.similarity_score * 100)}% match`}
                      {" \u00b7 "}{c.source_image_count} images
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button
                      onClick={() => handleMerge(c)}
                      class="px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => handleDismiss(c)}
                      class="px-2 py-1 text-xs bg-gray-600 text-astro-muted rounded hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Merged targets view */}
      <Show when={view() === "merged"}>
        <Show
          when={merged().length > 0}
          fallback={<p class="text-sm text-astro-muted">No merged targets yet.</p>}
        >
          <div class="space-y-2">
            <For each={merged()}>
              {(m) => (
                <div class="flex items-center justify-between p-3 bg-astro-dark border border-gray-700 rounded">
                  <div class="flex-1">
                    <span class="text-astro-muted text-sm">{m.primary_name}</span>
                    <span class="text-astro-muted text-xs mx-2">&larr; merged into &rarr;</span>
                    <span class="text-white text-sm font-medium">{m.merged_into_name}</span>
                    <div class="text-xs text-astro-muted mt-0.5">
                      {m.image_count} images {" \u00b7 "} {new Date(m.merged_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnmerge(m)}
                    class="px-2 py-1 text-xs bg-yellow-700 text-white rounded hover:bg-yellow-600"
                  >
                    Unmerge
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};
```

- [ ] **Step 2: Add Merges tab to SettingsPage**

In `frontend/src/pages/SettingsPage.tsx`, add import and tab:

```typescript
import { MergesTab } from "../components/settings/MergesTab";
```

Update TABS array (line 9-14):

```typescript
const TABS = [
  { id: "general", label: "General" },
  { id: "scan", label: "Scan & Ingest" },
  { id: "filters", label: "Filters" },
  { id: "equipment", label: "Equipment" },
  { id: "merges", label: "Target Merges" },
] as const;
```

Add Show block after the equipment tab (after line 53):

```typescript
      <Show when={activeTab() === "merges"}>
        <MergesTab />
      </Show>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/settings/MergesTab.tsx frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add Target Merges tab to settings with suggestion and merge management"
```

---

## Task 16: Exclude Soft-Deleted Targets from All Queries

**Files:**
- Modify: `backend/app/api/targets.py`

- [ ] **Step 1: Add merged_into_id filter to list_targets_aggregated**

In `backend/app/api/targets.py`, in `list_targets_aggregated`, add to `base_filter` (after line 212):

```python
    # Exclude soft-deleted (merged) targets
    base_filter.append(
        or_(
            Image.resolved_target_id.is_(None),
            Target.merged_into_id.is_(None),
        )
    )
```

- [ ] **Step 2: Add filter to target detail endpoint**

In `backend/app/api/targets.py`, in the target detail endpoint, after loading the target, add a check:

```python
    if target and target.merged_into_id is not None:
        raise HTTPException(404, "Target has been merged")
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/targets.py
git commit -m "feat: exclude soft-deleted merged targets from all query endpoints"
```

---

## Task 17: Run All Tests and Verify

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Fix any issues found**

Address any test failures or type errors.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address test failures and type errors from search improvements"
```
