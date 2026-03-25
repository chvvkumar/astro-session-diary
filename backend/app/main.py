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
