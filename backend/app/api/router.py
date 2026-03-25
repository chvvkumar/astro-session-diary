from fastapi import APIRouter

from .targets import router as targets_router
from .scan import router as scan_router
from .stats import router as stats_router

api_router = APIRouter(prefix="/api")
api_router.include_router(targets_router)
api_router.include_router(scan_router)
api_router.include_router(stats_router)
