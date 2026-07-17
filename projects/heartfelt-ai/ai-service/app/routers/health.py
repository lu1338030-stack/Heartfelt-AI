"""健康检查路由。"""
from fastapi import APIRouter, Request

router = APIRouter()


@router.get("")
@router.get("/")
async def health(request: Request):
    """Liveness probe - 服务存活检查。"""
    return {
        "status": "ok",
        "service": "heartfelt-ai-service",
        "models_loaded": getattr(request.app.state, "models_loaded", {}),
        "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
    }


@router.get("/ready")
async def readiness():
    """Readiness probe - 模型可用性检查（骨架期直接返回 ok）。"""
    return {
        "status": "ok",
        "service": "heartfelt-ai-service",
        "note": "skeleton mode - no models loaded yet",
    }
