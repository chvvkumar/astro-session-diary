from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user_settings import UserSettings, SETTINGS_ROW_ID
from app.models import Image
from app.schemas.settings import (
    GeneralSettings, FilterConfig, EquipmentConfig, EquipmentAliases,
    SettingsResponse, SuggestionsResponse, SuggestionGroup,
)

router = APIRouter(prefix="/settings", tags=["settings"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_settings(session: AsyncSession) -> UserSettings:
    result = await session.execute(
        select(UserSettings).where(UserSettings.id == SETTINGS_ROW_ID)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = UserSettings(id=SETTINGS_ROW_ID)
        session.add(row)
        await session.flush()
    return row


def _row_to_response(row: UserSettings) -> SettingsResponse:
    """Convert a UserSettings ORM row to a SettingsResponse schema."""
    general_data = row.general or {}
    filters_data = row.filters or {}
    equipment_data = row.equipment or {}

    general = GeneralSettings(**general_data)

    filters = {
        name: FilterConfig(**cfg)
        for name, cfg in filters_data.items()
    }

    eq_cameras = {
        name: EquipmentAliases(**aliases)
        for name, aliases in equipment_data.get("cameras", {}).items()
    }
    eq_telescopes = {
        name: EquipmentAliases(**aliases)
        for name, aliases in equipment_data.get("telescopes", {}).items()
    }
    equipment = EquipmentConfig(cameras=eq_cameras, telescopes=eq_telescopes)

    return SettingsResponse(general=general, filters=filters, equipment=equipment)


def _levenshtein(a: str, b: str) -> int:
    """Pure-Python Levenshtein distance."""
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(
                prev[j] + 1,       # deletion
                curr[j - 1] + 1,   # insertion
                prev[j - 1] + (0 if ca == cb else 1),  # substitution
            ))
        prev = curr
    return prev[-1]


def _group_by_similarity(rows: list[tuple[str, int]]) -> list[SuggestionGroup]:
    """
    Group names by:
    1. Case-insensitive match  (catches "OIII" / "oiii" / "Oiii")
    2. Levenshtein distance <= 2 for strings longer than 3 characters

    Returns only groups with 2+ members (singletons are not suggestions).
    """
    # Union-Find for grouping
    names = [r[0] for r in rows]
    counts = {r[0]: r[1] for r in rows}

    parent: dict[str, str] = {n: n for n in names}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[py] = px

    # Pass 1: case-insensitive grouping
    lower_to_first: dict[str, str] = {}
    for name in names:
        key = name.lower()
        if key in lower_to_first:
            union(lower_to_first[key], name)
        else:
            lower_to_first[key] = name

    # Pass 2: Levenshtein grouping (only for names > 3 chars)
    long_names = [n for n in names if len(n) > 3]
    for i in range(len(long_names)):
        for j in range(i + 1, len(long_names)):
            a, b = long_names[i], long_names[j]
            if find(a) != find(b):  # skip already-merged
                if _levenshtein(a.lower(), b.lower()) <= 2:
                    union(a, b)

    # Collect groups
    groups: dict[str, list[str]] = {}
    for name in names:
        root = find(name)
        groups.setdefault(root, []).append(name)

    result = []
    for members in groups.values():
        if len(members) >= 2:
            result.append(SuggestionGroup(
                group=sorted(members),
                counts={m: counts[m] for m in members},
            ))

    return result


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=SettingsResponse)
async def get_settings(session: AsyncSession = Depends(get_session)):
    """Return the full settings object, creating defaults if not yet present."""
    row = await _get_or_create_settings(session)
    return _row_to_response(row)


@router.put("/general", response_model=SettingsResponse)
async def update_general(
    payload: GeneralSettings,
    session: AsyncSession = Depends(get_session),
):
    """Update general settings and return the full settings object."""
    row = await _get_or_create_settings(session)
    row.general = payload.model_dump()
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


@router.put("/filters", response_model=SettingsResponse)
async def update_filters(
    payload: dict[str, FilterConfig],
    session: AsyncSession = Depends(get_session),
):
    """Update filter config (colors + aliases) and return full settings."""
    row = await _get_or_create_settings(session)
    row.filters = {name: cfg.model_dump() for name, cfg in payload.items()}
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


@router.put("/equipment", response_model=SettingsResponse)
async def update_equipment(
    payload: EquipmentConfig,
    session: AsyncSession = Depends(get_session),
):
    """Update equipment aliases and return full settings."""
    row = await _get_or_create_settings(session)
    row.equipment = payload.model_dump()
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


# ---------------------------------------------------------------------------
# Suggestions endpoints
# ---------------------------------------------------------------------------

@router.get("/suggestions/filters", response_model=SuggestionsResponse)
async def suggest_filters(session: AsyncSession = Depends(get_session)):
    """Return groups of similar filter names found in the image library."""
    q = (
        select(Image.filter_used, sa_func.count(Image.id))
        .where(Image.filter_used.isnot(None))
        .group_by(Image.filter_used)
    )
    result = await session.execute(q)
    rows = result.all()  # list of (name, count)
    suggestions = _group_by_similarity(rows)
    return SuggestionsResponse(suggestions=suggestions)


@router.get("/suggestions/equipment", response_model=SuggestionsResponse)
async def suggest_equipment(session: AsyncSession = Depends(get_session)):
    """Return groups of similar camera/telescope names found in the image library."""
    cam_q = (
        select(Image.camera, sa_func.count(Image.id))
        .where(Image.camera.isnot(None))
        .group_by(Image.camera)
    )
    cam_result = await session.execute(cam_q)
    camera_rows = cam_result.all()

    tel_q = (
        select(Image.telescope, sa_func.count(Image.id))
        .where(Image.telescope.isnot(None))
        .group_by(Image.telescope)
    )
    tel_result = await session.execute(tel_q)
    telescope_rows = tel_result.all()

    all_suggestions = (
        _group_by_similarity(camera_rows)
        + _group_by_similarity(telescope_rows)
    )
    return SuggestionsResponse(suggestions=all_suggestions)
