"""困惑度(Perplexity)计算服务。

用中文 GPT-2(uer/gpt2-chinese-cluecorpussmall)算文本困惑度,
辅助 backend 降AI 模块判断改写后文本是否还有 AI 特征。

PPL 反映"用词可预测性":
- AI 文本用词"安全"高可预测,PPL 低(15-35)
- 人类文本用词"不规律",PPL 高(40-80)
- 安全阈值:≥ 35(通过),25-35(可重试),< 25(硬失败)

模型在 FastAPI lifespan 启动时加载一次,缓存在本模块全局变量。
"""

import logging
import math
import re
from functools import lru_cache

import torch
from transformers import GPT2LMHeadModel, BertTokenizer

logger = logging.getLogger(__name__)

MODEL_NAME = "uer/gpt2-chinese-cluecorpussmall"

# 全局模型实例(在 lifespan 里加载一次)
# 注意:uer/gpt2-chinese 系列用 BertTokenizer(全字符级),不是 GPT2 BPE
_tokenizer: BertTokenizer | None = None
_model: GPT2LMHeadModel | None = None


def load_model() -> None:
    """加载 GPT-2 中文模型。在 FastAPI lifespan 启动时调用一次。"""
    global _tokenizer, _model
    if _model is not None:
        return
    logger.info("Loading %s ...", MODEL_NAME)
    # 关键:uer/gpt2-chinese 用 BertTokenizer,不是 GPT2Tokenizer
    _tokenizer = BertTokenizer.from_pretrained(MODEL_NAME)
    _model = GPT2LMHeadModel.from_pretrained(MODEL_NAME)
    _model.eval()
    logger.info("Model loaded: %s", MODEL_NAME)


def is_model_loaded() -> bool:
    return _model is not None and _tokenizer is not None


@lru_cache(maxsize=1024)
def calc_ppl(text: str) -> dict:
    """计算文本困惑度 + 突发性(句长标准差)。

    带缓存:相同文本(完全一致)不重复计算。lru_cache 基于 text 内容。

    Args:
        text: 中文文本(≥ 10 字符)

    Returns:
        {
            "ppl": 困惑度,float,
            "burstiness": 突发性(句长 σ),float,
            "sentence_count": 句子数,int,
        }
    """
    if not is_model_loaded():
        raise RuntimeError("GPT-2 模型未加载,请检查 lifespan 启动日志")

    # 1. 困惑度 PPL = exp(-1/N Σ log P(word_i | context))
    inputs = _tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
    )
    with torch.no_grad():
        outputs = _model(**inputs, labels=inputs["input_ids"])
    loss = outputs.loss.item()
    # 防 overflow:loss 过大时 cap
    ppl = math.exp(min(loss, 20))  # exp(20) ≈ 4.85e8,够用

    # 2. 突发性:句长标准差
    sentences = _split_sentences(text)
    if len(sentences) >= 2:
        lengths = [len(s) for s in sentences]
        mean = sum(lengths) / len(lengths)
        variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
        burstiness = math.sqrt(variance)
    else:
        burstiness = 0.0

    return {
        "ppl": round(ppl, 2),
        "burstiness": round(burstiness, 2),
        "sentence_count": len(sentences),
    }


def _split_sentences(text: str) -> list[str]:
    """按中英文句末标点分句。"""
    parts = re.split(r"[。!?!?\n]+", text)
    return [p.strip() for p in parts if p.strip()]
