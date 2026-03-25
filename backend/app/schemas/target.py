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
