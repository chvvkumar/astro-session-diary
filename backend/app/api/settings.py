from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_async_redis
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

    # One-time migration: copy auto-scan state from Redis if not yet migrated
    if not row.general or not row.general.get("_migrated"):
        r = get_async_redis()
        try:
            enabled = await r.get("autoscan:enabled")
            interval = await r.get("autoscan:interval")
            if enabled is not None or interval is not None:
                row.general = {
                    **(row.general or {}),
                    "auto_scan_enabled": enabled == "true" if enabled else True,
                    "auto_scan_interval": int(interval) if interval else 240,
                    "_migrated": True,
                }
                await session.flush()
        finally:
            await r.aclose()

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

    return SettingsResponse(
        general=general,
        filters=filters,
        equipment=equipment,
        dismissed_suggestions=row.dismissed_suggestions or [],
    )


def _build_known_names(config: dict) -> set[str]:
    """Build a set of all canonical names and their aliases from a config dict."""
    known: set[str] = set()
    for canonical, conf in config.items():
        known.add(canonical)
        for alias in conf.get("aliases", []):
            known.add(alias)
    return known


def _group_already_merged(group: SuggestionGroup, known: set[str]) -> bool:
    """Return True if every member of the group is already a known name or alias."""
    return all(name in known for name in group.group)


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


def _normalize_for_comparison(name: str) -> str:
    """Normalize a name for comparison: lowercase, strip separators."""
    return name.lower().replace("_", "").replace("-", "").replace(" ", "")


def _are_similar(a: str, b: str) -> bool:
    """Determine if two equipment/filter names likely refer to the same thing.

    Uses three strategies (no edit distance — too many false positives
    with names like ASI533MC/ASI533MM or Askar40/Askar140):
    1. Case-insensitive exact match
    2. Normalized match (ignore underscores, spaces, hyphens)
    3. One name contains the other (e.g. "ZWO ASI533MM Pro (ASI533MM)" contains "ZWO ASI533MM Pro")
    """
    la, lb = a.lower(), b.lower()

    # Exact case-insensitive
    if la == lb:
        return True

    # Normalized match (strip separators)
    na, nb = _normalize_for_comparison(a), _normalize_for_comparison(b)
    if na == nb:
        return True

    # Containment: one is a substring of the other (min 4 chars to avoid short false matches)
    if len(la) >= 4 and len(lb) >= 4:
        if la in lb or lb in la:
            return True

    return False


def _group_by_similarity(rows: list[tuple[str, int]]) -> list[SuggestionGroup]:
    """
    Group names that likely refer to the same item using multiple similarity
    strategies (case, normalization, containment, edit distance).

    Returns only groups with 2+ members (singletons are not suggestions).
    """
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

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if find(names[i]) != find(names[j]):
                if _are_similar(names[i], names[j]):
                    union(names[i], names[j])

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


@router.put("/dismissed-suggestions", response_model=SettingsResponse)
async def update_dismissed_suggestions(
    payload: list[list[str]],
    session: AsyncSession = Depends(get_session),
):
    """Update dismissed suggestions list and return full settings."""
    row = await _get_or_create_settings(session)
    # Normalize: sort each inner list for consistent deduplication
    row.dismissed_suggestions = [sorted(group) for group in payload]
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
    for s in suggestions:
        s.section = "filters"

    # Exclude groups already handled by saved aliases
    row = await _get_or_create_settings(session)
    known = _build_known_names(row.filters or {})
    suggestions = [s for s in suggestions if not _group_already_merged(s, known)]

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

    cam_suggestions = _group_by_similarity(camera_rows)
    for s in cam_suggestions:
        s.section = "cameras"
    tel_suggestions = _group_by_similarity(telescope_rows)
    for s in tel_suggestions:
        s.section = "telescopes"
    all_suggestions = cam_suggestions + tel_suggestions

    # Exclude groups already handled by saved aliases
    row = await _get_or_create_settings(session)
    eq = row.equipment or {}
    known = set()
    for section in ("cameras", "telescopes"):
        known |= _build_known_names(eq.get(section, {}))
    all_suggestions = [s for s in all_suggestions if not _group_already_merged(s, known)]

    return SuggestionsResponse(suggestions=all_suggestions)
