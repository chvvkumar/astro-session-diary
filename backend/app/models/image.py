import uuid
from datetime import datetime

from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Image(Base):
    __tablename__ = "images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    capture_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    resolved_target_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("targets.id"), nullable=True
    )

    # Extracted structured metadata for fast filtering
    exposure_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    filter_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sensor_temp: Mapped[float | None] = mapped_column(Float, nullable=True)
    camera_gain: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Equipment identification
    telescope: Mapped[str | None] = mapped_column(String(255), nullable=True)
    camera: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Quality metrics
    median_hfr: Mapped[float | None] = mapped_column(Float, nullable=True)
    eccentricity: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Complete raw FITS headers as JSONB
    raw_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    target: Mapped["Target | None"] = relationship(back_populates="images")

    __table_args__ = (
        Index("ix_images_capture_date", "capture_date"),
        Index("ix_images_filter_used", "filter_used"),
        Index("ix_images_resolved_target_id", "resolved_target_id"),
        Index("ix_images_image_type", "image_type"),
        Index("ix_images_raw_headers", "raw_headers", postgresql_using="gin"),
        Index("ix_images_telescope", "telescope"),
        Index("ix_images_camera", "camera"),
    )
