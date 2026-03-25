import uuid

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Image, Target
from app.schemas import ImageRead, ImageDetail, ImageListResponse

router = APIRouter(prefix="/images", tags=["images"])


@router.get("", response_model=ImageListResponse)
async def list_images(
    session: AsyncSession = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    target_name: str | None = Query(None),
    filter_used: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    min_exposure: float | None = Query(None),
    max_exposure: float | None = Query(None),
    header_key: str | None = Query(None),
    header_value: str | None = Query(None),
):
    """List images with filtering and pagination."""
    query = select(Image)
    count_query = select(func.count(Image.id))

    # Apply filters
    if filter_used:
        query = query.where(Image.filter_used == filter_used)
        count_query = count_query.where(Image.filter_used == filter_used)
    if date_from:
        query = query.where(Image.capture_date >= date_from)
        count_query = count_query.where(Image.capture_date >= date_from)
    if date_to:
        query = query.where(Image.capture_date <= date_to)
        count_query = count_query.where(Image.capture_date <= date_to)
    if min_exposure is not None:
        query = query.where(Image.exposure_time >= min_exposure)
        count_query = count_query.where(Image.exposure_time >= min_exposure)
    if max_exposure is not None:
        query = query.where(Image.exposure_time <= max_exposure)
        count_query = count_query.where(Image.exposure_time <= max_exposure)
    if target_name:
        query = query.join(Target).where(Target.primary_name.ilike(f"%{target_name}%"))
        count_query = count_query.join(Target).where(Target.primary_name.ilike(f"%{target_name}%"))
    if header_key and header_value:
        # JSONB containment query
        query = query.where(Image.raw_headers[header_key].astext == header_value)
        count_query = count_query.where(Image.raw_headers[header_key].astext == header_value)

    # Count total
    total_result = await session.execute(count_query)
    total = total_result.scalar_one()

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(Image.capture_date.desc().nullslast()).offset(offset).limit(page_size)
    result = await session.execute(query)
    images = result.scalars().all()

    return ImageListResponse(
        items=[ImageRead.model_validate(img) for img in images],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{image_id}", response_model=ImageDetail)
async def get_image(
    image_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Get full image detail including target info and raw headers."""
    query = select(Image).where(Image.id == image_id)
    result = await session.execute(query)
    image = result.scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return ImageDetail.model_validate(image)
