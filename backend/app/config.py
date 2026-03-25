from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://astro:astro@localhost:5432/astro_catalog"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]
    fits_data_path: str = "/app/data/fits"
    thumbnails_path: str = "/app/data/thumbnails"
    thumbnail_max_width: int = 800

    model_config = {"env_prefix": "ASTRO_"}


settings = Settings()
