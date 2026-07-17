"""FastAPI 应用入口。

Heartfelt AI 的算法微服务,由 NestJS Backend 调用。
负责:文本向量化、困惑度计算、AI 文本检测、向量库检索。
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import analyze, health, perplexity
from app.services.perplexity_service import load_model as load_gpt2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """生命周期钩子:启动时预热模型、关闭时释放资源。

    Phase 2:加载中文 GPT-2 用于 PPL 计算。
    首次运行会下载模型(~500MB)到 HF_HOME(./models)。
    """
    logger.info("AI Service starting, loading models...")
    app.state.models_loaded = {
        "bge-base-zh": False,
        "gpt2-chinese": False,
        "roberta-detector": False,
    }
    try:
        load_gpt2()
        app.state.models_loaded["gpt2-chinese"] = True
        logger.info("gpt2-chinese loaded successfully")
    except Exception as e:
        logger.error("Failed to load gpt2-chinese: %s", e)
        logger.warning("PPL 计算将不可用,但服务继续启动")

    yield
    logger.info("AI Service shutting down")


app = FastAPI(
    title="Heartfelt AI Service",
    description="论文查重 + AI 检测 + 降AI 的模型推理服务",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS:允许 backend (:3000) 和 frontend (:5173) 直接调用(开发期)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由注册
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(perplexity.router, prefix="/perplexity", tags=["perplexity"])
app.include_router(analyze.router, prefix="/analyze", tags=["analyze"])

# 后续业务路由(v1+)
# from app.routers import embed, detect_ai, semantic_search
# app.include_router(embed.router, prefix="/embed", tags=["embedding"])
# app.include_router(detect_ai.router, prefix="/detect-ai", tags=["detection"])
# app.include_router(semantic_search.router, prefix="/semantic-search", tags=["search"])


@app.get("/")
def root():
    return {
        "service": "heartfelt-ai-service",
        "version": "0.2.0",
        "docs": "/docs",
        "health": "/health",
    }
