import uuid

from pydantic import BaseModel


class TargetBase(BaseModel):
    primary_name: str
    aliases: list[str] = []
    ra: float | None = None
    dec: float | None = None
    object_type: str | None = None


class TargetRead(TargetBase):
    id: uuid.UUID

    model_config = {"from_attributes": True}


class TargetSearchResult(BaseModel):
    id: uuid.UUID
    primary_name: str
    object_type: str | None = None


class SessionSummary(BaseModel):
    session_date: str
    integration_seconds: float
    frame_count: int
    filters_used: list[str]


class TargetAggregation(BaseModel):
    target_id: uuid.UUID
    primary_name: str
    aliases: list[str] = []
    total_integration_seconds: float
    total_frames: int
    filter_distribution: dict[str, float]
    equipment: list[str]
    sessions: list[SessionSummary]


class AggregateStats(BaseModel):
    total_integration_seconds: float
    target_count: int
    total_frames: int
    disk_usage_bytes: int


class TargetAggregationResponse(BaseModel):
    targets: list[TargetAggregation]
    aggregates: AggregateStats


class SessionDetailResponse(BaseModel):
    target_name: str
    session_date: str
    thumbnail_url: str | None = None
    frame_count: int
    integration_seconds: float
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    filters_used: dict[str, int]
    equipment: dict[str, str | None]
    raw_reference_header: dict | None = None


class EquipmentResponse(BaseModel):
    cameras: list[str]
    telescopes: list[str]
