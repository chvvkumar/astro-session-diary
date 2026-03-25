# Astrophotography FITS Cataloger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a containerized, multi-host application that ingests, processes, and catalogs hundreds of thousands of FITS files with async background processing and a blazing-fast SolidJS UI.

**Architecture:** Two Docker hosts — Host A (Mini PC) runs PostgreSQL, Redis, FastAPI, and Celery for data storage and heavy processing; Host B runs Nginx serving a compiled SolidJS SPA. The worker reads FITS files from a bind-mounted drive, extracts metadata into a hybrid relational/JSONB schema, generates stretched thumbnails, and resolves targets via SIMBAD with local caching. The frontend communicates with Host A's API over CORS-enabled HTTP.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Celery, Redis, PostgreSQL 16, astropy, Pillow, astroquery, SolidJS, Vite, Tailwind CSS, Nginx, Docker Compose.

---

## File Structure

```
astro-session-diary/
├── docker-compose.yml                          # Host A: Postgres, Redis, API, Worker
├── docker-compose.frontend.yml                 # Host B: Nginx + SolidJS static build
├── .env.example                                # Environment variable template
├── .gitignore
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml                          # Python deps (fastapi, celery, astropy, etc.)
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/                           # Migration scripts
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                             # FastAPI app factory + CORS + static files
│   │   ├── config.py                           # Pydantic Settings (DB URL, Redis URL, CORS origins)
│   │   ├── database.py                         # Async SQLAlchemy engine + session factory
│   │   ├── models/
│   │   │   ├── __init__.py                     # Re-exports Base, Target, Image
│   │   │   ├── base.py                         # DeclarativeBase
│   │   │   ├── target.py                       # Target ORM model
│   │   │   └── image.py                        # Image ORM model
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── target.py                       # Target Pydantic schemas
│   │   │   └── image.py                        # Image Pydantic schemas
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── router.py                       # Aggregates sub-routers
│   │   │   ├── images.py                       # GET /images, GET /images/{id}
│   │   │   ├── targets.py                      # GET /targets/search
│   │   │   └── scan.py                         # POST /scan, GET /scan/status
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── scanner.py                      # Directory walker + dedup logic
│   │   │   ├── simbad.py                       # SIMBAD resolution + local cache
│   │   │   └── thumbnail.py                    # FITS → stretched JPEG pipeline
│   │   └── worker/
│   │       ├── __init__.py
│   │       ├── celery_app.py                   # Celery config (broker, backend, serializer)
│   │       └── tasks.py                        # ingest_file, resolve_target, generate_thumbnail
│   └── tests/
│       ├── conftest.py                         # Test DB, fixtures, tmp dirs
│       ├── test_config.py
│       ├── test_models.py
│       ├── test_scanner.py
│       ├── test_simbad.py
│       ├── test_thumbnail.py
│       ├── test_tasks.py
│       ├── test_api_images.py
│       ├── test_api_targets.py
│       └── test_api_scan.py
│
├── frontend/
│   ├── Dockerfile                              # Multi-stage: node build → nginx
│   ├── nginx.conf                              # Static file serving config
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── index.tsx                           # App mount point
│       ├── App.tsx                             # Root layout + router
│       ├── api/
│       │   └── client.ts                       # Fetch wrapper for Host A API
│       ├── store/
│       │   ├── catalog.ts                      # Image list, filters, pagination state
│       │   └── scan.ts                         # Scan progress polling state
│       ├── components/
│       │   ├── Gallery.tsx                     # Responsive grid of GalleryCards
│       │   ├── GalleryCard.tsx                 # Thumbnail + quick metadata overlay
│       │   ├── SearchBar.tsx                   # Target name autocomplete
│       │   ├── FilterPanel.tsx                 # Date, filter, exposure, temp controls
│       │   ├── ImageDetail.tsx                 # Full detail modal
│       │   ├── HeaderTable.tsx                 # Raw FITS header key/value display
│       │   └── ScanDashboard.tsx               # Scan trigger + progress bar
│       └── types/
│           └── index.ts                        # Shared TS interfaces (Image, Target, etc.)
│
└── docs/
    └── plans/
        └── 2026-03-24-fits-cataloger.md        # This file
```

---

## Phase 1: Infrastructure & Database Foundation

### Task 1.1: Project Scaffolding & Python Environment

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_config.py`
- Create: `.env.example`

- [ ] **Step 1: Create `backend/pyproject.toml` with all dependencies**

```toml
[project]
name = "astro-cataloger"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30.0",
    "alembic>=1.14.0",
    "pydantic-settings>=2.7.0",
    "celery[redis]>=5.4.0",
    "redis>=5.2.0",
    "astropy>=7.0.0",
    "astroquery>=0.4.8",
    "Pillow>=11.0.0",
    "httpx>=0.28.0",
    "psycopg2-binary>=2.9.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "pytest-cov>=6.0.0",
    "httpx>=0.28.0",
]

[build-system]
requires = ["setuptools>=75.0"]
build-backend = "setuptools.backends._legacy:_Backend"
```

- [ ] **Step 2: Create `backend/app/config.py` — application settings**

```python
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
```

- [ ] **Step 3: Create `.env.example`**

```env
ASTRO_DATABASE_URL=postgresql+asyncpg://astro:astro@postgres:5432/astro_catalog
ASTRO_REDIS_URL=redis://redis:6379/0
ASTRO_CORS_ORIGINS=["http://192.168.1.100:3000"]
ASTRO_FITS_DATA_PATH=/app/data/fits
ASTRO_THUMBNAILS_PATH=/app/data/thumbnails
ASTRO_THUMBNAIL_MAX_WIDTH=800
POSTGRES_USER=astro
POSTGRES_PASSWORD=astro
POSTGRES_DB=astro_catalog
```

- [ ] **Step 4: Write the failing test for config**

Create `backend/tests/conftest.py`:
```python
import os

os.environ.setdefault("ASTRO_DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test_catalog")
os.environ.setdefault("ASTRO_REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("ASTRO_FITS_DATA_PATH", "/tmp/test_fits")
os.environ.setdefault("ASTRO_THUMBNAILS_PATH", "/tmp/test_thumbnails")
```

Create `backend/tests/test_config.py`:
```python
from app.config import Settings


def test_settings_defaults():
    s = Settings()
    assert "postgresql" in s.database_url
    assert "redis" in s.redis_url
    assert s.thumbnail_max_width == 800


def test_settings_from_env(monkeypatch):
    monkeypatch.setenv("ASTRO_THUMBNAIL_MAX_WIDTH", "400")
    s = Settings()
    assert s.thumbnail_max_width == 400
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pip install -e ".[dev]" && pytest tests/test_config.py -v
```
Expected: 2 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/app/__init__.py backend/app/config.py \
    backend/tests/__init__.py backend/tests/conftest.py backend/tests/test_config.py \
    .env.example
git commit -m "feat: scaffold backend project with config and settings"
```

---

### Task 1.2: SQLAlchemy Models — Target & Image

**Files:**
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/target.py`
- Create: `backend/app/models/image.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/database.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Create `backend/app/models/base.py`**

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 2: Create `backend/app/models/target.py`**

```python
import uuid

from sqlalchemy import String, Float, Index
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Target(Base):
    __tablename__ = "targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    primary_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    ra: Mapped[float | None] = mapped_column(Float, nullable=True)
    dec: Mapped[float | None] = mapped_column(Float, nullable=True)
    object_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    images: Mapped[list["Image"]] = relationship(back_populates="target")

    __table_args__ = (
        Index("ix_targets_aliases", "aliases", postgresql_using="gin"),
    )
```

- [ ] **Step 3: Create `backend/app/models/image.py`**

```python
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

    # Complete raw FITS headers as JSONB
    raw_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    target: Mapped["Target | None"] = relationship(back_populates="images")

    __table_args__ = (
        Index("ix_images_capture_date", "capture_date"),
        Index("ix_images_filter_used", "filter_used"),
        Index("ix_images_resolved_target_id", "resolved_target_id"),
        Index("ix_images_raw_headers", "raw_headers", postgresql_using="gin"),
    )
```

- [ ] **Step 4: Create `backend/app/models/__init__.py`**

```python
from .base import Base
from .target import Target
from .image import Image

__all__ = ["Base", "Target", "Image"]
```

- [ ] **Step 5: Create `backend/app/database.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        yield session
```

- [ ] **Step 6: Write model tests**

Create `backend/tests/test_models.py`:
```python
import uuid
from datetime import datetime, timezone

from app.models import Target, Image


def test_target_creation():
    t = Target(
        primary_name="M31",
        aliases=["Andromeda", "NGC 224"],
        ra=10.6847,
        dec=41.2687,
        object_type="Galaxy",
    )
    assert t.primary_name == "M31"
    assert "Andromeda" in t.aliases
    assert t.ra == 10.6847


def test_image_creation():
    img = Image(
        file_path="/data/fits/2024-01-15/Light_M31_300s_001.fits",
        file_name="Light_M31_300s_001.fits",
        capture_date=datetime(2024, 1, 15, 22, 30, 0, tzinfo=timezone.utc),
        exposure_time=300.0,
        filter_used="Ha",
        sensor_temp=-10.0,
        camera_gain=120,
        raw_headers={"OBJECT": "M31", "TELESCOP": "RedCat 51"},
    )
    assert img.file_name == "Light_M31_300s_001.fits"
    assert img.raw_headers["TELESCOP"] == "RedCat 51"
    assert img.exposure_time == 300.0


def test_image_defaults():
    img = Image(file_path="/data/test.fits", file_name="test.fits")
    assert img.resolved_target_id is None
    assert img.thumbnail_path is None
```

- [ ] **Step 7: Run tests**

```bash
cd backend && pytest tests/test_models.py -v
```
Expected: 3 PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/ backend/app/database.py backend/tests/test_models.py
git commit -m "feat: add SQLAlchemy models for Target and Image with JSONB support"
```

---

### Task 1.3: Alembic Migration Setup

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Directory: `backend/alembic/versions/`

- [ ] **Step 1: Initialize Alembic**

```bash
cd backend && alembic init alembic
```

- [ ] **Step 2: Edit `backend/alembic/env.py` for async support**

Replace the generated `env.py` with:
```python
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from app.config import settings
from app.models import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 3: Update `backend/alembic.ini`**

Ensure the `sqlalchemy.url` line is set to a placeholder (env.py overrides it):
```ini
sqlalchemy.url = postgresql+asyncpg://astro:astro@localhost:5432/astro_catalog
```

- [ ] **Step 4: Generate initial migration**

```bash
cd backend && alembic revision --autogenerate -m "initial schema: targets and images tables"
```
Expected: A new file in `alembic/versions/` with `CREATE TABLE` for `targets` and `images`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic.ini backend/alembic/
git commit -m "feat: configure Alembic for async migrations with initial schema"
```

---

### Task 1.4: Docker Compose — Host A

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system deps for astropy/Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libjpeg62-turbo-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-astro}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-astro}
      POSTGRES_DB: ${POSTGRES_DB:-astro_catalog}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U astro"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      ASTRO_DATABASE_URL: postgresql+asyncpg://astro:astro@postgres:5432/astro_catalog
      ASTRO_REDIS_URL: redis://redis:6379/0
      ASTRO_FITS_DATA_PATH: /app/data/fits
      ASTRO_THUMBNAILS_PATH: /app/data/thumbnails
    volumes:
      - ./backend:/app
      - thumbnails_data:/app/data/thumbnails
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    build:
      context: ./backend
    command: celery -A app.worker.celery_app worker --loglevel=info --concurrency=4
    environment:
      ASTRO_DATABASE_URL: postgresql+asyncpg://astro:astro@postgres:5432/astro_catalog
      ASTRO_REDIS_URL: redis://redis:6379/0
      ASTRO_FITS_DATA_PATH: /app/data/fits
      ASTRO_THUMBNAILS_PATH: /app/data/thumbnails
    volumes:
      - ./backend:/app
      - thumbnails_data:/app/data/thumbnails
      - ${FITS_DATA_HOST_PATH:-./sample_fits}:/app/data/fits:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  postgres_data:
  thumbnails_data:
```

- [ ] **Step 3: Verify containers build**

```bash
docker compose build
```
Expected: Successful build of `api` and `worker` images.

- [ ] **Step 4: Verify containers start and communicate**

```bash
docker compose up -d postgres redis
docker compose exec postgres pg_isready -U astro
docker compose exec redis redis-cli ping
```
Expected: "accepting connections" and "PONG"

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/Dockerfile
git commit -m "feat: add Docker Compose for Host A (Postgres, Redis, API, Worker)"
```

---

## Phase 2: Core Engine (Worker Logic)

### Task 2.1: Thumbnail Generation Service

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/thumbnail.py`
- Create: `backend/tests/test_thumbnail.py`
- Required test fixture: a minimal FITS file (generated in test)

- [ ] **Step 1: Write failing test for thumbnail generation**

Create `backend/tests/test_thumbnail.py`:
```python
import numpy as np
import pytest
from astropy.io import fits
from pathlib import Path
from PIL import Image as PILImage

from app.services.thumbnail import generate_thumbnail


@pytest.fixture
def sample_fits_mono(tmp_path: Path) -> Path:
    """Create a minimal mono FITS file with synthetic star field."""
    rng = np.random.default_rng(42)
    # Background sky + a few bright "stars"
    data = rng.normal(loc=1000, scale=50, size=(256, 256)).astype(np.float32)
    data[128, 128] = 50000  # bright star
    data[64, 192] = 30000   # dimmer star

    hdu = fits.PrimaryHDU(data)
    hdu.header["OBJECT"] = "TestTarget"
    hdu.header["EXPTIME"] = 300.0
    file_path = tmp_path / "test_mono.fits"
    hdu.writeto(file_path)
    return file_path


@pytest.fixture
def sample_fits_color(tmp_path: Path) -> Path:
    """Create a minimal 3-channel color FITS file."""
    rng = np.random.default_rng(42)
    data = rng.normal(loc=1000, scale=50, size=(3, 128, 128)).astype(np.float32)
    data[0, 64, 64] = 40000  # red channel star
    data[1, 64, 64] = 45000  # green channel star
    data[2, 64, 64] = 35000  # blue channel star

    hdu = fits.PrimaryHDU(data)
    file_path = tmp_path / "test_color.fits"
    hdu.writeto(file_path)
    return file_path


def test_generate_thumbnail_mono(sample_fits_mono: Path, tmp_path: Path):
    output = tmp_path / "thumb.jpg"
    result = generate_thumbnail(sample_fits_mono, output, max_width=400)

    assert result == output
    assert output.exists()
    img = PILImage.open(output)
    assert img.width <= 400
    assert img.mode == "L" or img.mode == "RGB"


def test_generate_thumbnail_color(sample_fits_color: Path, tmp_path: Path):
    output = tmp_path / "thumb_color.jpg"
    result = generate_thumbnail(sample_fits_color, output, max_width=400)

    assert result == output
    assert output.exists()
    img = PILImage.open(output)
    assert img.width <= 400
    assert img.mode == "RGB"


def test_generate_thumbnail_respects_max_width(sample_fits_mono: Path, tmp_path: Path):
    output = tmp_path / "thumb_small.jpg"
    generate_thumbnail(sample_fits_mono, output, max_width=100)

    img = PILImage.open(output)
    assert img.width <= 100
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_thumbnail.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.thumbnail'`

- [ ] **Step 3: Implement `backend/app/services/thumbnail.py`**

```python
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.visualization import ZScaleInterval, AsinhStretch
from PIL import Image as PILImage


def _stretch_channel(data: np.ndarray) -> np.ndarray:
    """Apply ZScale + Asinh stretch to a single 2D channel."""
    interval = ZScaleInterval()
    vmin, vmax = interval.get_limits(data)
    # Normalize to [0, 1]
    normed = (data - vmin) / (vmax - vmin + 1e-10)
    normed = np.clip(normed, 0, 1)
    # Asinh stretch to reveal faint detail without blowing out stars
    stretch = AsinhStretch(a=0.1)
    stretched = stretch(normed)
    return (stretched * 255).astype(np.uint8)


def generate_thumbnail(
    fits_path: Path,
    output_path: Path,
    max_width: int = 800,
) -> Path:
    """Read a FITS file, apply MTF stretch, and save a JPEG thumbnail.

    Handles both mono (2D) and color (3D with shape [3, H, W]) data.
    Flips the image origin (FITS convention is bottom-up).
    """
    with fits.open(fits_path) as hdul:
        data = hdul[0].data.astype(np.float32)

    if data.ndim == 2:
        # Mono image
        stretched = _stretch_channel(data)
        img = PILImage.fromarray(np.flipud(stretched), mode="L")
    elif data.ndim == 3 and data.shape[0] == 3:
        # Color image: stretch each channel independently
        channels = [_stretch_channel(data[i]) for i in range(3)]
        rgb = np.stack([np.flipud(c) for c in channels], axis=-1)
        img = PILImage.fromarray(rgb, mode="RGB")
    else:
        raise ValueError(f"Unsupported FITS data shape: {data.shape}")

    # Resize maintaining aspect ratio
    if img.width > max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), PILImage.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "JPEG", quality=85)
    return output_path
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_thumbnail.py -v
```
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/thumbnail.py backend/tests/test_thumbnail.py
git commit -m "feat: add FITS thumbnail generation with ZScale + Asinh stretch"
```

---

### Task 2.2: SIMBAD Target Resolution Service

**Files:**
- Create: `backend/app/services/simbad.py`
- Create: `backend/tests/test_simbad.py`

- [ ] **Step 1: Write failing test for SIMBAD service**

Create `backend/tests/test_simbad.py`:
```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.simbad import resolve_target_name, normalize_object_name


def test_normalize_object_name():
    assert normalize_object_name("m 31") == "M31"
    assert normalize_object_name("  ngc  224 ") == "NGC224"
    assert normalize_object_name("IC1396") == "IC1396"
    assert normalize_object_name("Andromeda Galaxy") == "ANDROMEDA GALAXY"


class TestResolveTargetName:
    """Tests for SIMBAD resolution with mocked external API."""

    @pytest.mark.asyncio
    async def test_resolve_known_messier_object(self):
        mock_result = {
            "primary_name": "M 31",
            "aliases": ["M31", "NGC 224", "Andromeda Galaxy"],
            "ra": 10.6847,
            "dec": 41.2687,
            "object_type": "Galaxy",
        }
        with patch("app.services.simbad._query_simbad", new_callable=AsyncMock, return_value=mock_result):
            result = await resolve_target_name("m 31")

        assert result is not None
        assert result["primary_name"] == "M 31"
        assert "NGC 224" in result["aliases"]
        assert result["ra"] == pytest.approx(10.6847, abs=0.01)

    @pytest.mark.asyncio
    async def test_resolve_unknown_object_returns_none(self):
        with patch("app.services.simbad._query_simbad", new_callable=AsyncMock, return_value=None):
            result = await resolve_target_name("XYZNOTREAL123")
        assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_simbad.py -v
```
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement `backend/app/services/simbad.py`**

```python
import re
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SIMBAD_TAP_URL = "https://simbad.u-strasbg.fr/simbad/sim-id"


def normalize_object_name(name: str) -> str:
    """Normalize a target name: strip whitespace, uppercase, collapse spaces."""
    cleaned = re.sub(r"\s+", "", name.strip()).upper()
    return cleaned


async def _query_simbad(object_name: str) -> dict[str, Any] | None:
    """Query SIMBAD for an object by name. Returns structured data or None."""
    params = {
        "Ident": object_name,
        "output.format": "ASCII",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Use the SIMBAD script interface for structured results
            script = f"""
                format object "%MAIN_ID|%OTYPELIST|%COO(d;A)|%COO(d;D)"
                query id {object_name}
            """
            resp = await client.post(
                "https://simbad.cds.unistra.fr/simbad/sim-script",
                data={"script": script},
                timeout=15.0,
            )
            resp.raise_for_status()

            text = resp.text
            # Parse the response — look for data lines after ::data::
            if "::error::" in text:
                logger.info("SIMBAD found no match for '%s'", object_name)
                return None

            data_section = text.split("::data::")[-1].strip()
            lines = [l.strip() for l in data_section.splitlines() if l.strip() and not l.startswith("~")]
            if not lines:
                return None

            parts = lines[0].split("|")
            if len(parts) < 4:
                return None

            main_id = parts[0].strip()
            obj_type = parts[1].strip()
            ra = float(parts[2].strip()) if parts[2].strip() else None
            dec = float(parts[3].strip()) if parts[3].strip() else None

            # Fetch aliases via a second query
            alias_script = f"""
                format object "%IDLIST[%*]"
                query id {object_name}
            """
            alias_resp = await client.post(
                "https://simbad.cds.unistra.fr/simbad/sim-script",
                data={"script": alias_script},
                timeout=15.0,
            )
            aliases = []
            if alias_resp.status_code == 200:
                alias_data = alias_resp.text.split("::data::")[-1].strip()
                aliases = [a.strip() for a in alias_data.splitlines() if a.strip() and not a.startswith("~")]

            return {
                "primary_name": main_id,
                "aliases": aliases,
                "ra": ra,
                "dec": dec,
                "object_type": obj_type,
            }

    except (httpx.HTTPError, ValueError, IndexError) as e:
        logger.warning("SIMBAD query failed for '%s': %s", object_name, e)
        return None


async def resolve_target_name(object_name: str) -> dict[str, Any] | None:
    """Resolve an object name via SIMBAD. Returns dict with primary_name,
    aliases, ra, dec, object_type — or None if not found."""
    return await _query_simbad(object_name)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_simbad.py -v
```
Expected: 3 PASS (normalize tests + 2 mocked resolution tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/simbad.py backend/tests/test_simbad.py
git commit -m "feat: add SIMBAD target resolution service with name normalization"
```

---

### Task 2.3: Directory Scanner Service

**Files:**
- Create: `backend/app/services/scanner.py`
- Create: `backend/tests/test_scanner.py`

- [ ] **Step 1: Write failing test for scanner**

Create `backend/tests/test_scanner.py`:
```python
import pytest
from pathlib import Path
from astropy.io import fits
import numpy as np

from app.services.scanner import scan_directory, extract_metadata


@pytest.fixture
def fits_tree(tmp_path: Path) -> Path:
    """Create a directory tree with FITS files and non-FITS files."""
    # Create FITS files in subdirectories
    for subdir in ["2024-01-15", "2024-01-16"]:
        d = tmp_path / subdir
        d.mkdir()
        for i in range(3):
            data = np.zeros((64, 64), dtype=np.float32)
            hdu = fits.PrimaryHDU(data)
            hdu.header["OBJECT"] = "M31"
            hdu.header["EXPTIME"] = 300.0
            hdu.header["FILTER"] = "Ha"
            hdu.header["CCD-TEMP"] = -10.0
            hdu.header["GAIN"] = 120
            hdu.header["DATE-OBS"] = f"2024-01-{15 + int(subdir[-2:])-15}T22:{i:02d}:00"
            hdu.writeto(d / f"Light_{i:03d}.fits")

    # Non-FITS file (should be ignored)
    (tmp_path / "notes.txt").write_text("session notes")
    return tmp_path


def test_scan_directory_finds_all_fits(fits_tree: Path):
    found = list(scan_directory(fits_tree))
    assert len(found) == 6
    assert all(f.suffix == ".fits" for f in found)


def test_scan_directory_excludes_known_paths(fits_tree: Path):
    known = {str(fits_tree / "2024-01-15" / "Light_000.fits")}
    found = list(scan_directory(fits_tree, known_paths=known))
    assert len(found) == 5


def test_extract_metadata(fits_tree: Path):
    fits_file = fits_tree / "2024-01-15" / "Light_000.fits"
    meta = extract_metadata(fits_file)

    assert meta["file_name"] == "Light_000.fits"
    assert meta["object_name"] == "M31"
    assert meta["exposure_time"] == 300.0
    assert meta["filter_used"] == "Ha"
    assert meta["sensor_temp"] == -10.0
    assert meta["camera_gain"] == 120
    assert "OBJECT" in meta["raw_headers"]
    assert meta["capture_date"] is not None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_scanner.py -v
```
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement `backend/app/services/scanner.py`**

```python
from pathlib import Path
from datetime import datetime
from typing import Any, Iterator

from astropy.io import fits

FITS_EXTENSIONS = {".fits", ".fit", ".fts", ".FITS", ".FIT", ".FTS"}


def scan_directory(
    root: Path,
    known_paths: set[str] | None = None,
) -> Iterator[Path]:
    """Walk a directory tree yielding FITS file paths not in known_paths."""
    known = known_paths or set()
    for path in root.rglob("*"):
        if path.suffix in FITS_EXTENSIONS and str(path) not in known:
            yield path


def extract_metadata(fits_path: Path) -> dict[str, Any]:
    """Extract structured metadata and raw headers from a FITS file."""
    with fits.open(fits_path) as hdul:
        header = hdul[0].header

    raw_headers = {k: _serialize_header_value(v) for k, v in header.items() if k}

    capture_date = None
    date_obs = header.get("DATE-OBS")
    if date_obs:
        try:
            capture_date = datetime.fromisoformat(date_obs)
        except ValueError:
            pass

    return {
        "file_path": str(fits_path),
        "file_name": fits_path.name,
        "object_name": header.get("OBJECT"),
        "exposure_time": header.get("EXPTIME"),
        "filter_used": header.get("FILTER"),
        "sensor_temp": header.get("CCD-TEMP"),
        "camera_gain": header.get("GAIN"),
        "capture_date": capture_date,
        "raw_headers": raw_headers,
    }


def _serialize_header_value(value: Any) -> Any:
    """Ensure header values are JSON-serializable."""
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    return str(value)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_scanner.py -v
```
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/scanner.py backend/tests/test_scanner.py
git commit -m "feat: add directory scanner with metadata extraction from FITS headers"
```

---

### Task 2.4: Celery Worker Configuration & Tasks

**Files:**
- Create: `backend/app/worker/__init__.py`
- Create: `backend/app/worker/celery_app.py`
- Create: `backend/app/worker/tasks.py`
- Create: `backend/tests/test_tasks.py`

- [ ] **Step 1: Create `backend/app/worker/__init__.py`** (empty file)

- [ ] **Step 2: Create `backend/app/worker/celery_app.py`**

```python
from celery import Celery

from app.config import settings

celery_app = Celery(
    "astro_cataloger",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

celery_app.autodiscover_tasks(["app.worker"])
```

- [ ] **Step 3: Write failing test for tasks**

Create `backend/tests/test_tasks.py`:
```python
import pytest
import numpy as np
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
from astropy.io import fits

from app.services.scanner import extract_metadata
from app.services.thumbnail import generate_thumbnail


@pytest.fixture
def sample_fits(tmp_path: Path) -> Path:
    data = np.random.default_rng(42).normal(1000, 50, (128, 128)).astype(np.float32)
    hdu = fits.PrimaryHDU(data)
    hdu.header["OBJECT"] = "NGC 7000"
    hdu.header["EXPTIME"] = 600.0
    hdu.header["FILTER"] = "OIII"
    hdu.header["CCD-TEMP"] = -15.0
    hdu.header["GAIN"] = 100
    hdu.header["DATE-OBS"] = "2024-06-15T01:30:00"
    path = tmp_path / "Light_NGC7000_001.fits"
    hdu.writeto(path)
    return path


def test_full_ingest_pipeline(sample_fits: Path, tmp_path: Path):
    """Integration test: extract metadata + generate thumbnail for a single file."""
    meta = extract_metadata(sample_fits)
    assert meta["object_name"] == "NGC 7000"
    assert meta["filter_used"] == "OIII"

    thumb_path = tmp_path / "thumbnails" / "thumb.jpg"
    result = generate_thumbnail(sample_fits, thumb_path, max_width=200)
    assert result.exists()
```

- [ ] **Step 4: Create `backend/app/worker/tasks.py`**

```python
import logging
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Image, Target
from app.services.scanner import extract_metadata
from app.services.simbad import resolve_target_name, normalize_object_name
from app.services.thumbnail import generate_thumbnail
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# Celery uses sync — create a sync engine for the worker
# Replace asyncpg with psycopg2 for sync operations
_sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
_sync_engine = create_engine(_sync_url)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def ingest_file(self, fits_path: str) -> dict:
    """Full ingest pipeline for a single FITS file.

    1. Extract metadata from FITS headers
    2. Generate stretched JPEG thumbnail
    3. Resolve target name via SIMBAD (with local cache)
    4. Insert/update database record
    """
    path = Path(fits_path)
    logger.info("Ingesting: %s", path.name)

    try:
        # Step 1: Extract metadata
        meta = extract_metadata(path)

        # Step 2: Generate thumbnail
        thumb_filename = path.stem + ".jpg"
        thumb_path = Path(settings.thumbnails_path) / thumb_filename
        generate_thumbnail(path, thumb_path, max_width=settings.thumbnail_max_width)

        # Step 3: Resolve target (sync wrapper for async SIMBAD call)
        target_id = None
        object_name = meta.get("object_name")
        if object_name:
            target_id = _resolve_or_cache_target(object_name)

        # Step 4: Insert into database
        with Session(_sync_engine) as session:
            image = Image(
                file_path=meta["file_path"],
                file_name=meta["file_name"],
                capture_date=meta.get("capture_date"),
                thumbnail_path=str(thumb_path),
                resolved_target_id=target_id,
                exposure_time=meta.get("exposure_time"),
                filter_used=meta.get("filter_used"),
                sensor_temp=meta.get("sensor_temp"),
                camera_gain=meta.get("camera_gain"),
                raw_headers=meta.get("raw_headers", {}),
            )
            session.add(image)
            session.commit()
            logger.info("Ingested: %s (target=%s)", path.name, target_id)
            return {"file": str(path), "status": "ok"}

    except Exception as exc:
        logger.error("Failed to ingest %s: %s", path, exc)
        raise self.retry(exc=exc)


def _resolve_or_cache_target(object_name: str) -> str | None:
    """Check local DB for target, fall back to SIMBAD, cache result."""
    import asyncio

    normalized = normalize_object_name(object_name)

    with Session(_sync_engine) as session:
        # Check local cache: search aliases array
        stmt = select(Target).where(Target.aliases.any(normalized))
        existing = session.execute(stmt).scalar_one_or_none()
        if existing:
            return str(existing.id)

        # Also check by primary_name
        stmt = select(Target).where(Target.primary_name == object_name)
        existing = session.execute(stmt).scalar_one_or_none()
        if existing:
            return str(existing.id)

    # Query SIMBAD
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(resolve_target_name(object_name))
    finally:
        loop.close()

    if result is None:
        return None

    # Cache the new target
    with Session(_sync_engine) as session:
        # Normalize all aliases for consistent matching
        aliases = [normalize_object_name(a) for a in result.get("aliases", [])]
        if normalized not in aliases:
            aliases.append(normalized)

        target = Target(
            primary_name=result["primary_name"],
            aliases=aliases,
            ra=result.get("ra"),
            dec=result.get("dec"),
            object_type=result.get("object_type"),
        )
        session.add(target)
        session.commit()
        return str(target.id)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_tasks.py -v
```
Expected: 1 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/worker/ backend/tests/test_tasks.py
git commit -m "feat: add Celery worker with full ingest pipeline task"
```

---

## Phase 3: The API Layer

### Task 3.1: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/target.py`
- Create: `backend/app/schemas/image.py`

- [ ] **Step 1: Create `backend/app/schemas/target.py`**

```python
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
```

- [ ] **Step 2: Create `backend/app/schemas/image.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel

from .target import TargetRead


class ImageBase(BaseModel):
    file_path: str
    file_name: str
    capture_date: datetime | None = None
    exposure_time: float | None = None
    filter_used: str | None = None
    sensor_temp: float | None = None
    camera_gain: int | None = None


class ImageRead(ImageBase):
    id: uuid.UUID
    thumbnail_path: str | None = None
    resolved_target_id: uuid.UUID | None = None
    raw_headers: dict | None = None

    model_config = {"from_attributes": True}


class ImageDetail(ImageRead):
    target: TargetRead | None = None


class ImageListResponse(BaseModel):
    items: list[ImageRead]
    total: int
    page: int
    page_size: int


class ImageFilterParams(BaseModel):
    target_name: str | None = None
    filter_used: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    min_exposure: float | None = None
    max_exposure: float | None = None
    header_key: str | None = None
    header_value: str | None = None
    page: int = 1
    page_size: int = 50
```

- [ ] **Step 3: Create `backend/app/schemas/__init__.py`**

```python
from .target import TargetBase, TargetRead, TargetSearchResult
from .image import ImageBase, ImageRead, ImageDetail, ImageListResponse, ImageFilterParams

__all__ = [
    "TargetBase", "TargetRead", "TargetSearchResult",
    "ImageBase", "ImageRead", "ImageDetail", "ImageListResponse", "ImageFilterParams",
]
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat: add Pydantic schemas for API request/response validation"
```

---

### Task 3.2: Image API Endpoints

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/images.py`
- Create: `backend/app/api/router.py`
- Create: `backend/tests/test_api_images.py`

- [ ] **Step 1: Write failing test for image endpoints**

Create `backend/tests/test_api_images.py`:
```python
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def mock_session():
    session = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_list_images_empty():
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    mock_count_result = MagicMock()
    mock_count_result.scalar_one.return_value = 0

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_count_result, mock_result])

    async def mock_get_session():
        yield mock_session

    app.dependency_overrides[_get_session_dep()] = mock_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/images")

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0

    app.dependency_overrides.clear()


def _get_session_dep():
    from app.database import get_session
    return get_session
```

- [ ] **Step 2: Create `backend/app/api/images.py`**

```python
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
```

- [ ] **Step 3: Create `backend/app/api/__init__.py`** (empty file)

- [ ] **Step 4: Create `backend/app/api/router.py`** (images only — targets and scan added in Task 3.3)

```python
from fastapi import APIRouter

from .images import router as images_router

api_router = APIRouter(prefix="/api")
api_router.include_router(images_router)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pytest tests/test_api_images.py -v
```
Expected: PASS (may need `app/main.py` — created in Task 3.4)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/__init__.py backend/app/api/images.py backend/app/api/router.py
git commit -m "feat: add image list and detail API endpoints with filtering"
```

---

### Task 3.3: Target & Scan API Endpoints

**Files:**
- Create: `backend/app/api/targets.py`
- Create: `backend/app/api/scan.py`
- Create: `backend/tests/test_api_targets.py`
- Create: `backend/tests/test_api_scan.py`

- [ ] **Step 1: Create `backend/app/api/targets.py`**

```python
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
```

- [ ] **Step 2: Create `backend/app/api/scan.py`**

```python
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from celery.result import AsyncResult

from app.config import settings
from app.database import get_session
from app.models import Image
from app.services.scanner import scan_directory
from app.worker.tasks import ingest_file

router = APIRouter(prefix="/scan", tags=["scan"])

# In-memory scan state (simple approach; could use Redis for multi-worker)
_scan_state = {"running": False, "total": 0, "queued": 0}


@router.post("")
async def trigger_scan(
    session: AsyncSession = Depends(get_session),
):
    """Walk the FITS directory, queue new files for ingestion."""
    if _scan_state["running"]:
        return {"status": "already_running", **_scan_state}

    _scan_state["running"] = True
    _scan_state["total"] = 0
    _scan_state["queued"] = 0

    # Get known paths from DB
    result = await session.execute(select(Image.file_path))
    known_paths = {row[0] for row in result.all()}

    fits_root = Path(settings.fits_data_path)
    new_files = list(scan_directory(fits_root, known_paths=known_paths))
    _scan_state["total"] = len(new_files)

    for fits_path in new_files:
        ingest_file.delay(str(fits_path))
        _scan_state["queued"] += 1

    _scan_state["running"] = False

    return {
        "status": "complete",
        "new_files_queued": len(new_files),
        "already_known": len(known_paths),
    }


@router.get("/status")
async def scan_status():
    """Return current scan state."""
    return _scan_state
```

- [ ] **Step 3: Write test for target search endpoint**

Create `backend/tests/test_api_targets.py`:
```python
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import get_session
from app.models import Target


@pytest.mark.asyncio
async def test_search_targets():
    mock_target = MagicMock(spec=Target)
    mock_target.id = uuid.uuid4()
    mock_target.primary_name = "M 31"
    mock_target.object_type = "Galaxy"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_target]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/targets/search?q=M31")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["primary_name"] == "M 31"

    app.dependency_overrides.clear()
```

- [ ] **Step 4: Write test for scan endpoint**

Create `backend/tests/test_api_scan.py`:
```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import get_session


@pytest.mark.asyncio
async def test_trigger_scan_empty_directory():
    mock_result = MagicMock()
    mock_result.all.return_value = []

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    with patch("app.api.scan.scan_directory", return_value=[]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/scan")

    assert resp.status_code == 200
    data = resp.json()
    assert data["new_files_queued"] == 0

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_scan_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/scan/status")

    assert resp.status_code == 200
    data = resp.json()
    assert "running" in data
```

- [ ] **Step 5: Update `backend/app/api/router.py` to include targets and scan routers**

```python
from fastapi import APIRouter

from .images import router as images_router
from .targets import router as targets_router
from .scan import router as scan_router

api_router = APIRouter(prefix="/api")
api_router.include_router(images_router)
api_router.include_router(targets_router)
api_router.include_router(scan_router)
```

- [ ] **Step 6: Run tests**

```bash
cd backend && pytest tests/test_api_targets.py tests/test_api_scan.py -v
```
Expected: 3 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/targets.py backend/app/api/scan.py backend/app/api/router.py \
    backend/tests/test_api_targets.py backend/tests/test_api_scan.py
git commit -m "feat: add target search and scan trigger API endpoints"
```

---

### Task 3.4: FastAPI App Factory & CORS

**Files:**
- Create: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/main.py`**

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.api.router import api_router


def create_app() -> FastAPI:
    application = FastAPI(
        title="Astro FITS Cataloger",
        version="0.1.0",
        description="Astrophotography FITS file catalog and browser",
    )

    # CORS — allow the frontend host
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    application.include_router(api_router)

    # Serve generated thumbnails as static files
    thumbnails_dir = Path(settings.thumbnails_path)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)
    application.mount(
        "/thumbnails",
        StaticFiles(directory=str(thumbnails_dir)),
        name="thumbnails",
    )

    return application


app = create_app()
```

- [ ] **Step 2: Verify all API tests pass**

```bash
cd backend && pytest tests/ -v
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: add FastAPI app factory with CORS and static thumbnail serving"
```

---

## Phase 4: The Interface (SolidJS)

> **Note on frontend testing:** SolidJS component testing requires `solid-testing-library` and `jsdom` setup which adds significant complexity. Frontend tasks in this phase focus on building components with manual verification via the dev server. Integration testing of the full UI is deferred to Phase 5 or a follow-up plan. The API client and stores are validated indirectly through the backend API tests.

### Task 4.1: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/index.tsx`

- [ ] **Step 1: Initialize the SolidJS project**

```bash
cd frontend && npx degit solidjs/templates/ts . --force
npm install
npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

- [ ] **Step 2: Configure `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        astro: {
          dark: "#0a0a1a",
          panel: "#12122a",
          accent: "#4f7cff",
          muted: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Configure `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Update `frontend/src/index.tsx`**

```tsx
/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
render(() => <App />, root!);
```

- [ ] **Step 5: Verify dev server starts**

```bash
cd frontend && npm run dev
```
Expected: Vite dev server starts on port 3000

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold SolidJS frontend with Tailwind CSS dark theme"
```

---

### Task 4.2: TypeScript Types & API Client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Create `frontend/src/types/index.ts`**

```typescript
export interface Target {
  id: string;
  primary_name: string;
  aliases: string[];
  ra: number | null;
  dec: number | null;
  object_type: string | null;
}

export interface Image {
  id: string;
  file_path: string;
  file_name: string;
  capture_date: string | null;
  thumbnail_path: string | null;
  resolved_target_id: string | null;
  exposure_time: number | null;
  filter_used: string | null;
  sensor_temp: number | null;
  camera_gain: number | null;
  raw_headers: Record<string, unknown> | null;
}

export interface ImageDetail extends Image {
  target: Target | null;
}

export interface ImageListResponse {
  items: Image[];
  total: number;
  page: number;
  page_size: number;
}

export interface TargetSearchResult {
  id: string;
  primary_name: string;
  object_type: string | null;
}

export interface ScanResult {
  status: string;
  new_files_queued: number;
  already_known: number;
}

export interface ScanStatus {
  running: boolean;
  total: number;
  queued: number;
}

export interface ImageFilters {
  target_name?: string;
  filter_used?: string;
  date_from?: string;
  date_to?: string;
  min_exposure?: number;
  max_exposure?: number;
  header_key?: string;
  header_value?: string;
  page: number;
  page_size: number;
}
```

- [ ] **Step 2: Create `frontend/src/api/client.ts`**

```typescript
import type {
  ImageListResponse,
  ImageDetail,
  TargetSearchResult,
  ScanResult,
  ScanStatus,
  ImageFilters,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

function buildQuery(filters: ImageFilters): string {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.page_size));
  if (filters.target_name) params.set("target_name", filters.target_name);
  if (filters.filter_used) params.set("filter_used", filters.filter_used);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.min_exposure != null) params.set("min_exposure", String(filters.min_exposure));
  if (filters.max_exposure != null) params.set("max_exposure", String(filters.max_exposure));
  if (filters.header_key) params.set("header_key", filters.header_key);
  if (filters.header_value) params.set("header_value", filters.header_value);
  return params.toString();
}

export const api = {
  listImages: (filters: ImageFilters) =>
    fetchJson<ImageListResponse>(`/images?${buildQuery(filters)}`),

  getImage: (id: string) =>
    fetchJson<ImageDetail>(`/images/${id}`),

  searchTargets: (query: string) =>
    fetchJson<TargetSearchResult[]>(`/targets/search?q=${encodeURIComponent(query)}`),

  triggerScan: () =>
    fetchJson<ScanResult>("/scan", { method: "POST" }),

  getScanStatus: () =>
    fetchJson<ScanStatus>("/scan/status"),

  thumbnailUrl: (path: string) => {
    const base = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:8000";
    const filename = path.split("/").pop();
    return `${base}/thumbnails/${filename}`;
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/ frontend/src/api/
git commit -m "feat: add TypeScript types and API client for backend communication"
```

---

### Task 4.3: State Management (Stores)

**Files:**
- Create: `frontend/src/store/catalog.ts`
- Create: `frontend/src/store/scan.ts`

- [ ] **Step 1: Create `frontend/src/store/catalog.ts`**

```typescript
import { createSignal, createResource } from "solid-js";
import { api } from "../api/client";
import type { ImageFilters, ImageListResponse, ImageDetail } from "../types";

const defaultFilters: ImageFilters = {
  page: 1,
  page_size: 50,
};

const [filters, setFilters] = createSignal<ImageFilters>({ ...defaultFilters });
const [imageList] = createResource(filters, (f) => api.listImages(f));

const [selectedImageId, setSelectedImageId] = createSignal<string | null>(null);
const [selectedImage] = createResource(selectedImageId, (id) =>
  id ? api.getImage(id) : undefined
);

export function useCatalog() {
  return {
    filters,
    setFilters,
    imageList,
    selectedImageId,
    setSelectedImageId,
    selectedImage,

    updateFilter: <K extends keyof ImageFilters>(key: K, value: ImageFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: key === "page" ? value as number : 1 }));
    },

    nextPage: () => {
      const current = filters();
      const list = imageList();
      if (list && current.page * current.page_size < list.total) {
        setFilters((prev) => ({ ...prev, page: prev.page + 1 }));
      }
    },

    prevPage: () => {
      setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
    },

    resetFilters: () => setFilters({ ...defaultFilters }),
  };
}
```

- [ ] **Step 2: Create `frontend/src/store/scan.ts`**

```typescript
import { createSignal } from "solid-js";
import { api } from "../api/client";
import type { ScanResult, ScanStatus } from "../types";

const [scanStatus, setScanStatus] = createSignal<ScanStatus>({ running: false, total: 0, queued: 0 });
const [lastScanResult, setLastScanResult] = createSignal<ScanResult | null>(null);
const [isScanning, setIsScanning] = createSignal(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function useScan() {
  return {
    scanStatus,
    lastScanResult,
    isScanning,

    startScan: async () => {
      setIsScanning(true);
      try {
        const result = await api.triggerScan();
        setLastScanResult(result);
      } finally {
        setIsScanning(false);
      }
    },

    pollStatus: () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        const status = await api.getScanStatus();
        setScanStatus(status);
        if (!status.running && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }, 2000);
    },

    stopPolling: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/
git commit -m "feat: add SolidJS reactive stores for catalog and scan state"
```

---

### Task 4.4: Gallery Components

**Files:**
- Create: `frontend/src/components/GalleryCard.tsx`
- Create: `frontend/src/components/Gallery.tsx`

- [ ] **Step 1: Create `frontend/src/components/GalleryCard.tsx`**

```tsx
import type { Component } from "solid-js";
import type { Image } from "../types";
import { api } from "../api/client";

interface Props {
  image: Image;
  onClick: (id: string) => void;
}

const GalleryCard: Component<Props> = (props) => {
  const thumbUrl = () =>
    props.image.thumbnail_path ? api.thumbnailUrl(props.image.thumbnail_path) : null;

  return (
    <div
      class="bg-astro-panel rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-astro-accent transition-all"
      onClick={() => props.onClick(props.image.id)}
    >
      <div class="aspect-square bg-astro-dark flex items-center justify-center">
        {thumbUrl() ? (
          <img
            src={thumbUrl()!}
            alt={props.image.file_name}
            class="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span class="text-astro-muted text-sm">No thumbnail</span>
        )}
      </div>
      <div class="p-2 text-xs">
        <p class="text-white truncate font-medium">{props.image.file_name}</p>
        <div class="flex justify-between text-astro-muted mt-1">
          <span>{props.image.filter_used || "—"}</span>
          <span>{props.image.exposure_time ? `${props.image.exposure_time}s` : "—"}</span>
        </div>
        {props.image.capture_date && (
          <p class="text-astro-muted mt-0.5">
            {new Date(props.image.capture_date).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
};

export default GalleryCard;
```

- [ ] **Step 2: Create `frontend/src/components/Gallery.tsx`**

```tsx
import { Component, For, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import GalleryCard from "./GalleryCard";

const Gallery: Component = () => {
  const { imageList, setSelectedImageId, nextPage, prevPage, filters } = useCatalog();

  return (
    <div>
      <Show when={imageList.loading}>
        <div class="text-center py-12 text-astro-muted">Loading...</div>
      </Show>

      <Show when={imageList.error}>
        <div class="text-center py-12 text-red-400">
          Error loading images: {imageList.error?.message}
        </div>
      </Show>

      <Show when={imageList() && !imageList.loading}>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <For each={imageList()!.items}>
            {(image) => (
              <GalleryCard image={image} onClick={setSelectedImageId} />
            )}
          </For>
        </div>

        {/* Pagination */}
        <div class="flex justify-between items-center mt-6 text-sm text-astro-muted">
          <button
            class="px-3 py-1 bg-astro-panel rounded disabled:opacity-30"
            disabled={filters().page <= 1}
            onClick={prevPage}
          >
            Previous
          </button>
          <span>
            Page {filters().page} of{" "}
            {Math.ceil((imageList()?.total || 0) / filters().page_size)}
            {" "}({imageList()?.total || 0} images)
          </span>
          <button
            class="px-3 py-1 bg-astro-panel rounded disabled:opacity-30"
            disabled={
              filters().page * filters().page_size >= (imageList()?.total || 0)
            }
            onClick={nextPage}
          >
            Next
          </button>
        </div>
      </Show>
    </div>
  );
};

export default Gallery;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GalleryCard.tsx frontend/src/components/Gallery.tsx
git commit -m "feat: add Gallery grid and GalleryCard components with lazy loading"
```

---

### Task 4.5: Search Bar with Target Autocomplete

**Files:**
- Create: `frontend/src/components/SearchBar.tsx`

- [ ] **Step 1: Create `frontend/src/components/SearchBar.tsx`**

```tsx
import { Component, createSignal, For, Show } from "solid-js";
import { api } from "../api/client";
import { useCatalog } from "../store/catalog";
import type { TargetSearchResult } from "../types";

const SearchBar: Component = () => {
  const { updateFilter } = useCatalog();
  const [query, setQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<TargetSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  let debounceTimer: ReturnType<typeof setTimeout>;

  const onInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceTimer);
    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await api.searchTargets(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const selectTarget = (target: TargetSearchResult) => {
    setQuery(target.primary_name);
    setShowSuggestions(false);
    updateFilter("target_name", target.primary_name);
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    setShowSuggestions(false);
    updateFilter("target_name", query() || undefined);
  };

  return (
    <form onSubmit={onSubmit} class="relative w-full max-w-md">
      <input
        type="text"
        value={query()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onFocus={() => suggestions().length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Search targets (e.g., M31, NGC 7000)..."
        class="w-full px-4 py-2 bg-astro-panel border border-gray-700 rounded-lg text-white placeholder-astro-muted focus:outline-none focus:ring-2 focus:ring-astro-accent"
      />

      <Show when={showSuggestions()}>
        <div class="absolute z-50 w-full mt-1 bg-astro-panel border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <For each={suggestions()}>
            {(target) => (
              <button
                type="button"
                class="w-full text-left px-4 py-2 hover:bg-astro-accent/20 text-white text-sm"
                onMouseDown={() => selectTarget(target)}
              >
                <span class="font-medium">{target.primary_name}</span>
                <Show when={target.object_type}>
                  <span class="text-astro-muted ml-2">({target.object_type})</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </form>
  );
};

export default SearchBar;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SearchBar.tsx
git commit -m "feat: add SearchBar with SIMBAD target autocomplete"
```

---

### Task 4.6: Filter Panel

**Files:**
- Create: `frontend/src/components/FilterPanel.tsx`

- [ ] **Step 1: Create `frontend/src/components/FilterPanel.tsx`**

```tsx
import { Component } from "solid-js";
import { useCatalog } from "../store/catalog";

const FilterPanel: Component = () => {
  const { filters, updateFilter, resetFilters } = useCatalog();

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium text-sm">Filters</h3>
        <button
          onClick={resetFilters}
          class="text-xs text-astro-accent hover:underline"
        >
          Reset
        </button>
      </div>

      {/* Filter type */}
      <div>
        <label class="text-xs text-astro-muted block mb-1">Filter</label>
        <select
          value={filters().filter_used || ""}
          onChange={(e) => updateFilter("filter_used", e.currentTarget.value || undefined)}
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
        >
          <option value="">All Filters</option>
          <option value="L">Luminance</option>
          <option value="R">Red</option>
          <option value="G">Green</option>
          <option value="B">Blue</option>
          <option value="Ha">H-alpha</option>
          <option value="OIII">OIII</option>
          <option value="SII">SII</option>
        </select>
      </div>

      {/* Date range */}
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-astro-muted block mb-1">From</label>
          <input
            type="date"
            value={filters().date_from || ""}
            onChange={(e) => updateFilter("date_from", e.currentTarget.value || undefined)}
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label class="text-xs text-astro-muted block mb-1">To</label>
          <input
            type="date"
            value={filters().date_to || ""}
            onChange={(e) => updateFilter("date_to", e.currentTarget.value || undefined)}
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>

      {/* Exposure range */}
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-astro-muted block mb-1">Min Exp (s)</label>
          <input
            type="number"
            value={filters().min_exposure ?? ""}
            onChange={(e) =>
              updateFilter("min_exposure", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
            }
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label class="text-xs text-astro-muted block mb-1">Max Exp (s)</label>
          <input
            type="number"
            value={filters().max_exposure ?? ""}
            onChange={(e) =>
              updateFilter("max_exposure", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
            }
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>

      {/* JSONB header search */}
      <div>
        <label class="text-xs text-astro-muted block mb-1">Header Search</label>
        <div class="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Key (e.g. TELESCOP)"
            value={filters().header_key || ""}
            onChange={(e) => updateFilter("header_key", e.currentTarget.value || undefined)}
            class="px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
          <input
            type="text"
            placeholder="Value"
            value={filters().header_value || ""}
            onChange={(e) => updateFilter("header_value", e.currentTarget.value || undefined)}
            class="px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FilterPanel.tsx
git commit -m "feat: add FilterPanel with date, exposure, filter, and header search controls"
```

---

### Task 4.7: Image Detail Modal & Header Table

**Files:**
- Create: `frontend/src/components/HeaderTable.tsx`
- Create: `frontend/src/components/ImageDetail.tsx`

- [ ] **Step 1: Create `frontend/src/components/HeaderTable.tsx`**

```tsx
import { Component, For } from "solid-js";

interface Props {
  headers: Record<string, unknown>;
}

const HeaderTable: Component<Props> = (props) => {
  const entries = () =>
    Object.entries(props.headers)
      .filter(([k]) => k.trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div class="max-h-96 overflow-y-auto">
      <table class="w-full text-xs">
        <thead class="sticky top-0 bg-astro-panel">
          <tr class="text-astro-muted">
            <th class="text-left py-1 px-2 font-medium">Key</th>
            <th class="text-left py-1 px-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          <For each={entries()}>
            {([key, value]) => (
              <tr class="border-t border-gray-800 hover:bg-astro-dark/50">
                <td class="py-1 px-2 text-astro-accent font-mono">{key}</td>
                <td class="py-1 px-2 text-white font-mono break-all">
                  {String(value)}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};

export default HeaderTable;
```

- [ ] **Step 2: Create `frontend/src/components/ImageDetail.tsx`**

```tsx
import { Component, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import { api } from "../api/client";
import HeaderTable from "./HeaderTable";

const ImageDetail: Component = () => {
  const { selectedImage, setSelectedImageId } = useCatalog();

  const close = () => setSelectedImageId(null);

  return (
    <Show when={selectedImage()}>
      {(detail) => (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div class="bg-astro-panel rounded-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div class="flex justify-between items-center p-4 border-b border-gray-800">
              <h2 class="text-white font-bold text-lg truncate">
                {detail().file_name}
              </h2>
              <button
                onClick={close}
                class="text-astro-muted hover:text-white text-xl px-2"
              >
                x
              </button>
            </div>

            <div class="grid md:grid-cols-2 gap-4 p-4">
              {/* Thumbnail */}
              <div class="aspect-square bg-astro-dark rounded-lg overflow-hidden flex items-center justify-center">
                <Show
                  when={detail().thumbnail_path}
                  fallback={<span class="text-astro-muted">No thumbnail</span>}
                >
                  <img
                    src={api.thumbnailUrl(detail().thumbnail_path!)}
                    alt={detail().file_name}
                    class="w-full h-full object-contain"
                  />
                </Show>
              </div>

              {/* Metadata */}
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <MetaField label="Target" value={detail().target?.primary_name} />
                  <MetaField label="Object Type" value={detail().target?.object_type} />
                  <MetaField label="Filter" value={detail().filter_used} />
                  <MetaField label="Exposure" value={detail().exposure_time ? `${detail().exposure_time}s` : null} />
                  <MetaField label="Sensor Temp" value={detail().sensor_temp ? `${detail().sensor_temp}°C` : null} />
                  <MetaField label="Gain" value={detail().camera_gain?.toString()} />
                  <MetaField
                    label="Captured"
                    value={detail().capture_date ? new Date(detail().capture_date!).toLocaleString() : null}
                  />
                  <MetaField label="RA / Dec" value={
                    detail().target?.ra != null
                      ? `${detail().target!.ra!.toFixed(4)} / ${detail().target!.dec!.toFixed(4)}`
                      : null
                  } />
                </div>

                <div class="text-xs text-astro-muted break-all">
                  <span class="font-medium">Path:</span> {detail().file_path}
                </div>
              </div>
            </div>

            {/* Raw FITS Headers */}
            <Show when={detail().raw_headers}>
              <div class="border-t border-gray-800 p-4">
                <h3 class="text-white font-medium text-sm mb-2">FITS Headers</h3>
                <HeaderTable headers={detail().raw_headers!} />
              </div>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};

function MetaField(props: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span class="text-astro-muted text-xs">{props.label}</span>
      <p class="text-white">{props.value || "—"}</p>
    </div>
  );
}

export default ImageDetail;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HeaderTable.tsx frontend/src/components/ImageDetail.tsx
git commit -m "feat: add ImageDetail modal with FITS header table display"
```

---

### Task 4.8: Scan Dashboard

**Files:**
- Create: `frontend/src/components/ScanDashboard.tsx`

- [ ] **Step 1: Create `frontend/src/components/ScanDashboard.tsx`**

```tsx
import { Component, Show, onCleanup } from "solid-js";
import { useScan } from "../store/scan";

const ScanDashboard: Component = () => {
  const { scanStatus, lastScanResult, isScanning, startScan, pollStatus, stopPolling } = useScan();

  onCleanup(stopPolling);

  const handleScan = async () => {
    pollStatus();
    await startScan();
  };

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium text-sm">Scan & Ingest</h3>
        <button
          onClick={handleScan}
          disabled={isScanning()}
          class="px-4 py-1.5 bg-astro-accent text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-astro-accent/80 transition-colors"
        >
          {isScanning() ? "Scanning..." : "Scan Directory"}
        </button>
      </div>

      <Show when={isScanning()}>
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-astro-muted">
            <span>Processing...</span>
            <span>{scanStatus().queued} / {scanStatus().total}</span>
          </div>
          <div class="w-full bg-astro-dark rounded-full h-2">
            <div
              class="bg-astro-accent h-2 rounded-full transition-all"
              style={{
                width: scanStatus().total > 0
                  ? `${(scanStatus().queued / scanStatus().total) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>
      </Show>

      <Show when={lastScanResult()}>
        {(result) => (
          <div class="text-xs text-astro-muted space-y-0.5">
            <p>Status: <span class="text-green-400">{result().status}</span></p>
            <p>New files queued: {result().new_files_queued}</p>
            <p>Already cataloged: {result().already_known}</p>
          </div>
        )}
      </Show>
    </div>
  );
};

export default ScanDashboard;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ScanDashboard.tsx
git commit -m "feat: add ScanDashboard with progress bar and scan trigger"
```

---

### Task 4.9: Root App Layout

**Files:**
- Create: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css` (Tailwind imports)

- [ ] **Step 1: Create/update `frontend/src/index.css`**

```css
@import "tailwindcss";

body {
  @apply bg-astro-dark text-white;
}
```

- [ ] **Step 2: Create `frontend/src/App.tsx`**

```tsx
import type { Component } from "solid-js";
import Gallery from "./components/Gallery";
import SearchBar from "./components/SearchBar";
import FilterPanel from "./components/FilterPanel";
import ImageDetail from "./components/ImageDetail";
import ScanDashboard from "./components/ScanDashboard";

const App: Component = () => {
  return (
    <div class="min-h-screen bg-astro-dark">
      {/* Top Bar */}
      <header class="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <h1 class="text-white font-bold text-lg whitespace-nowrap">
          Astro Cataloger
        </h1>
        <SearchBar />
      </header>

      {/* Main Layout */}
      <div class="flex">
        {/* Sidebar */}
        <aside class="w-72 min-h-[calc(100vh-57px)] border-r border-gray-800 p-4 space-y-4 hidden lg:block">
          <ScanDashboard />
          <FilterPanel />
        </aside>

        {/* Content */}
        <main class="flex-1 p-4">
          <Gallery />
        </main>
      </div>

      {/* Detail Modal (renders when an image is selected) */}
      <ImageDetail />
    </div>
  );
};

export default App;
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd frontend && npm run build
```
Expected: Successful build in `dist/` directory

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/index.css
git commit -m "feat: assemble root App layout with sidebar, gallery, and detail modal"
```

---

## Phase 5: Deployment & Refinement

### Task 5.1: Frontend Docker (Multi-stage Build)

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `docker-compose.frontend.yml`

- [ ] **Step 1: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
```

- [ ] **Step 2: Create `frontend/Dockerfile`**

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Create `docker-compose.frontend.yml`**

```yaml
services:
  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_URL: ${API_URL:-http://192.168.1.50:8000/api}
    ports:
      - "3000:80"
    restart: unless-stopped
```

- [ ] **Step 4: Verify frontend container builds**

```bash
docker compose -f docker-compose.frontend.yml build
```
Expected: Successful multi-stage build

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf docker-compose.frontend.yml
git commit -m "feat: add multi-stage Dockerfile and Nginx config for frontend deployment"
```

---

### Task 5.2: File Watchdog (Optional Real-time Detection)

**Files:**
- Modify: `backend/pyproject.toml` (add watchdog dependency)
- Create: `backend/app/services/watcher.py`
- Create: `backend/tests/test_watcher.py`

- [ ] **Step 1: Add watchdog to `backend/pyproject.toml` dependencies**

Add `"watchdog>=6.0.0"` to the `dependencies` list.

- [ ] **Step 2: Write failing test for watcher**

Create `backend/tests/test_watcher.py`:
```python
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.watcher import FitsEventHandler


def test_handler_detects_fits_file(tmp_path: Path):
    mock_callback = MagicMock()
    handler = FitsEventHandler(callback=mock_callback)

    # Simulate a file creation event
    event = MagicMock()
    event.is_directory = False
    event.src_path = str(tmp_path / "Light_001.fits")

    handler.on_created(event)
    mock_callback.assert_called_once_with(str(tmp_path / "Light_001.fits"))


def test_handler_ignores_non_fits(tmp_path: Path):
    mock_callback = MagicMock()
    handler = FitsEventHandler(callback=mock_callback)

    event = MagicMock()
    event.is_directory = False
    event.src_path = str(tmp_path / "notes.txt")

    handler.on_created(event)
    mock_callback.assert_not_called()
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_watcher.py -v
```
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: Implement `backend/app/services/watcher.py`**

```python
import logging
from pathlib import Path

from watchdog.events import FileSystemEventHandler

from app.services.scanner import FITS_EXTENSIONS

logger = logging.getLogger(__name__)


class FitsEventHandler(FileSystemEventHandler):
    """Watches for new FITS files and triggers a callback."""

    def __init__(self, callback):
        super().__init__()
        self.callback = callback

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix in FITS_EXTENSIONS:
            logger.info("New FITS file detected: %s", path.name)
            self.callback(str(path))


def start_watcher(watch_path: str, callback) -> None:
    """Start a filesystem watcher on the given path.
    Call this from a dedicated thread in the worker container.
    """
    from watchdog.observers import Observer

    handler = FitsEventHandler(callback=callback)
    observer = Observer()
    observer.schedule(handler, watch_path, recursive=True)
    observer.start()
    logger.info("Watching %s for new FITS files", watch_path)
    return observer
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_watcher.py -v
```
Expected: 2 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/watcher.py backend/tests/test_watcher.py backend/pyproject.toml
git commit -m "feat: add filesystem watcher for real-time FITS file detection"
```

---

### Task 5.3: .gitignore & Final Cleanup

**Files:**
- Create/Update: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/
.venv/
*.egg

# Node
node_modules/
frontend/dist/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
*.swp

# Docker
docker-compose.override.yml

# OS
.DS_Store
Thumbs.db

# Generated data
thumbnails/

# Docs (generated plans — not tracked)
docs/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore with Python, Node, Docker, and docs exclusions"
```

---

## Agent Parallelism Guide

The following tasks can be executed **in parallel** by independent agents:

| Parallel Group | Tasks | Dependencies |
|---|---|---|
| **Group A: Infrastructure** | 1.1, 1.3, 1.4 | 1.2 must complete before 1.3 |
| **Group B: Services** (after Phase 1) | 2.1, 2.2, 2.3 | All independent — no shared state |
| **Group C: Worker** (after Group B) | 2.4 | Depends on 2.1, 2.2, 2.3 |
| **Group D: API** (after Phase 1) | 3.1, 3.2, 3.3 | 3.2/3.3 need 3.1 schemas. 3.4 depends on all |
| **Group E: Frontend** (after 3.1 types) | 4.1, 4.2, 4.3 | Can start once API types are defined |
| **Group F: Frontend Components** (after Group E) | 4.4, 4.5, 4.6, 4.7, 4.8 | All independent of each other |
| **Group G: Assembly** (after Group F) | 4.9 | Depends on all components existing |
| **Group H: Deployment** | 5.1, 5.2, 5.3 | 5.1 independent. 5.2 needs Phase 2. 5.3 anytime |

**Recommended execution order for maximum parallelism:**
1. Start: 1.1 + 5.3 (gitignore)
2. After 1.1: 1.2 → 1.3 + 1.4 (in parallel)
3. After Phase 1: 2.1 + 2.2 + 2.3 + 3.1 (all in parallel)
4. After services: 2.4 + 3.2 + 3.3 + 4.1 + 4.2 (in parallel)
5. After API + frontend scaffold: 3.4 + 4.3
6. After stores: 4.4 + 4.5 + 4.6 + 4.7 + 4.8 (all in parallel)
7. After all components: 4.9
8. After frontend: 5.1 + 5.2
