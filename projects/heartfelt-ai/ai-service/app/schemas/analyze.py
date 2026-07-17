"""/analyze 路由的请求/响应模型。

用 pydantic 定义,自动生成 OpenAPI schema,给 backend 强类型客户端用。

设计:
    - 和 backend 的 DTO 字段命名对齐(snake_case,Python 风格)
    - backend 拿到响应后,如果有需要再转成 camelCase 给前端
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ===== 请求 =====


class AnalyzeRequest(BaseModel):
    """POST /analyze 请求体。"""

    text: str = Field(
        ...,
        min_length=1,
        max_length=100_000,
        description="待分析/预处理的中文文本",
    )
    scenario: str = Field(
        default="academic",
        description="场景: academic / blog / opinion(影响 LLM hint 风格,目前预留)",
    )
    do_preprocess: bool = Field(
        default=True,
        description="是否做规则引擎预处理 + 词级替换。False = 只分析,不改文本",
    )
    do_vocab_replace: bool = Field(
        default=True,
        description="是否做 jieba 词级同义词替换(仅在 do_preprocess=True 时生效)",
    )
    do_ppl: bool = Field(
        default=True,
        description="是否调用 PPL(需要 torch 已装)。False = 跳过 PPL 检测",
    )
    vocab_replace_rate: float = Field(
        default=0.6,
        ge=0.0,
        le=1.0,
        description="词级替换率(0=不替换,1=全替换)",
    )


# ===== 响应子结构 =====


class MetricsBlock(BaseModel):
    """文本指标(所有维度)。"""

    # 自检指标(对应 Node audit-loop.ts)
    dash_residual: int = Field(..., description="破折号残留数(目标 0)")
    ai_vocab_per_1k: float = Field(..., description="AI 口癖词每千字(目标 < 3)")
    sentence_length_sigma: float = Field(
        ..., description="句长变异系数(目标 > 0.45)"
    )
    sentence_count: int = Field(..., description="句子数")

    # PPL(可选,torch 未装时为 None)
    ppl: float | None = Field(None, description="GPT-2 困惑度(≥ 45 通过)")
    burstiness: float | None = Field(
        None, description="突发性(句长 σ,AI ~1.2,人类 ~4.7)"
    )


class RuleHitBlock(BaseModel):
    """规则命中记录。"""

    rule_id: str
    count: int
    reason: str


class FlagHitBlock(BaseModel):
    """flagged 规则标记。"""

    pattern_name: str
    positions: list[int]
    hint: str


class VocabReplaceBlock(BaseModel):
    """词级替换明细。"""

    replacements: list[dict] = Field(
        default_factory=list,
        description='[{"original": "研究", "pos": "v", "replaced": "考察", "index": 3}]',
    )
    replace_rate: float = Field(..., description="实际替换率")
    skipped_protected: list[str] = Field(
        default_factory=list, description="被白名单保护未替换的词"
    )


class LlmHintBlock(BaseModel):
    """给 LLM 重写的精准提示。

    这是 Python 侧最大的价值:
    把抽象的"自检不通过"翻译成 LLM 能听懂的具体指导。
    """

    text_hints: list[str] = Field(
        default_factory=list,
        description="文本级提示(自检失败原因、规则命中)",
    )
    sentence_hints: list[str] = Field(
        default_factory=list,
        description="句子级提示(哪句太长、哪句重复)",
    )
    vocab_hints: list[str] = Field(
        default_factory=list,
        description="词汇级提示(高频词清单、推荐替换)",
    )
    ppl_hint: str | None = Field(
        None, description="PPL 相关提示(只在 PPL 不达标时填)"
    )

    def all_hints(self) -> list[str]:
        """扁平化所有提示,给 LLM 拼成 retryHint 用。"""
        out = []
        out.extend(self.text_hints)
        out.extend(self.sentence_hints)
        out.extend(self.vocab_hints)
        if self.ppl_hint:
            out.append(self.ppl_hint)
        return out


# ===== 响应主结构 =====


class AnalyzeResponse(BaseModel):
    """POST /analyze 响应。"""

    # 预处理后的文本(do_preprocess=False 时 == 原文)
    preprocessed_text: str = Field(..., description="预处理后的文本")

    # 各层结果
    metrics: MetricsBlock
    rule_hits: list[RuleHitBlock] = Field(default_factory=list)
    flags: list[FlagHitBlock] = Field(default_factory=list)
    vocab_replace: VocabReplaceBlock | None = Field(
        None, description="词级替换明细(do_vocab_replace=False 时为 None)"
    )
    llm_hints: LlmHintBlock

    # 综合判定
    passed: bool = Field(..., description="是否通过所有自检(不含 PPL)")
    failed_reasons: list[str] = Field(default_factory=list)

    # 元信息
    ppl_available: bool = Field(..., description="PPL 是否实际计算了")
    processing_ms: int = Field(..., description="总耗时(ms)")
