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


class SessionOverview(BaseModel):
    session_date: str
    integration_seconds: float
    frame_count: int
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    filters_used: list[str]
    camera: str | None = None
    telescope: str | None = None


class FilterDetail(BaseModel):
    filter_name: str
    frame_count: int
    integration_seconds: float
    median_hfr: float | None = None
    median_eccentricity: float | None = None
    exposure_time: float | None = None


class SessionInsight(BaseModel):
    level: str
    message: str


class FrameRecord(BaseModel):
    timestamp: str
    filter_used: str | None = None
    exposure_time: float | None = None
    median_hfr: float | None = None
    eccentricity: float | None = None
    sensor_temp: float | None = None
    gain: int | None = None
    file_name: str


class TargetAggregation(BaseModel):
    target_id: str
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


class TargetDetailResponse(BaseModel):
    target_id: str
    primary_name: str
    aliases: list[str] = []
    object_type: str | None = None
    ra: float | None = None
    dec: float | None = None
    total_integration_seconds: float
    total_frames: int
    avg_hfr: float | None = None
    avg_eccentricity: float | None = None
    filters_used: list[str]
    equipment: list[str]
    first_session_date: str
    last_session_date: str
    session_count: int
    sessions: list[SessionOverview]


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
    min_hfr: float | None = None
    max_hfr: float | None = None
    min_eccentricity: float | None = None
    max_eccentricity: float | None = None
    sensor_temp: float | None = None
    sensor_temp_min: float | None = None
    sensor_temp_max: float | None = None
    gain: int | None = None
    exposure_time: float | None = None
    first_frame_time: str | None = None
    last_frame_time: str | None = None
    filter_details: list[FilterDetail] = []
    insights: list[SessionInsight] = []
    frames: list[FrameRecord] = []


class EquipmentResponse(BaseModel):
    cameras: list[str]
    telescopes: list[str]
