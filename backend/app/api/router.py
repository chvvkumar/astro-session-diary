from fastapi import APIRouter

from .images import router as images_router
from .targets import router as targets_router
from .scan import router as scan_router

api_router = APIRouter(prefix="/api")
api_router.include_router(images_router)
api_router.include_router(targets_router)
api_router.include_router(scan_router)
