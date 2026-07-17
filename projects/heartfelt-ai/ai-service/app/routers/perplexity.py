"""困惑度计算路由。

POST /perplexity
请求:{"text": "..."}
响应:{"ppl": 35.2, "burstiness": 4.7, "sentence_count": 5}
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.perplexity_service import calc_ppl, is_model_loaded

router = APIRouter()


class PerplexityRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=10000, description="中文文本")


class PerplexityResponse(BaseModel):
    ppl: float = Field(..., description="困惑度。AI 文本 15-35,人类 40-80")
    burstiness: float = Field(..., description="突发性(句长 σ)。AI ~1.2,人类 ~4.7")
    sentence_count: int = Field(..., description="句子数")


@router.post("", response_model=PerplexityResponse)
@router.post("/", response_model=PerplexityResponse)
async def calc_perplexity(req: PerplexityRequest):
    """计算文本困惑度。需要 GPT-2 模型已加载。"""
    if not is_model_loaded():
        raise HTTPException(
            status_code=503,
            detail="GPT-2 模型未加载,ai-service 启动中或加载失败",
        )
    try:
        result = calc_ppl(req.text)
        return PerplexityResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PPL 计算失败: {e}") from e
