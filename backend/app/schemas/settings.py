from pydantic import BaseModel, Field


class GeneralSettings(BaseModel):
    auto_scan_enabled: bool = True
    auto_scan_interval: int = 240
    thumbnail_width: int = 800
    default_page_size: int = 50


class FilterConfig(BaseModel):
    color: str = "#808080"
    aliases: list[str] = Field(default_factory=list)


class EquipmentAliases(BaseModel):
    aliases: list[str] = Field(default_factory=list)


class EquipmentConfig(BaseModel):
    cameras: dict[str, EquipmentAliases] = Field(default_factory=dict)
    telescopes: dict[str, EquipmentAliases] = Field(default_factory=dict)


class SettingsResponse(BaseModel):
    general: GeneralSettings
    filters: dict[str, FilterConfig]
    equipment: EquipmentConfig


class SuggestionGroup(BaseModel):
    group: list[str]
    counts: dict[str, int]
    section: str | None = None  # "cameras" or "telescopes" for equipment suggestions


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionGroup]
