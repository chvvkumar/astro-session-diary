from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Target
from app.schemas import TargetSearchResult

router = APIRouter(prefix="/targets", tags=["targets"])


@router.get("/search", response_model=list[TargetSearchResult])
async def search_targets(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Search targets by name or alias for autocomplete."""
    pattern = f"%{q}%"
    query = (
        select(Target)
        .where(
            or_(
                Target.primary_name.ilike(pattern),
                Target.aliases.any(func.upper(q)),
            )
        )
        .limit(limit)
    )
    result = await session.execute(query)
    targets = result.scalars().all()
    return [TargetSearchResult.model_validate(t) for t in targets]
