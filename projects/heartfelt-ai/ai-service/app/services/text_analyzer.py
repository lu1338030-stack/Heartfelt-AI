"""文本分析器 - 纯统计层。

从 backend/src/humanize/lib/audit-loop.ts 迁移。
负责所有"不改文本"的指标计算,作为后续检测/反馈循环的基础。

Phase 1 目标:
    和 Node audit-loop.ts 对同一文本输出数值一致(误差 < 0.01)。

覆盖指标:
    - 破折号残留数(对应 audit-loop 的 dashResidual)
    - AI 口癖词每千字(aiVocabPer1k)
    - 句长变异系数(sentenceLengthSigma)
    - 句子切分(split_sentences)
    - 综合分析(analyze) - 返回所有指标 + passed/retryHint

阈值常量(从 audit-loop.ts 同步,严禁改动):
    DASH_MAX = 0           # 破折号零容忍
    AI_VOCAB_PER_1K_MAX = 3
    SENTENCE_SIGMA_MIN = 0.45
    SIGMA_CHECK_MIN_LENGTH = 100
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.data.ai_fingerprint_dict import count_ai_vocab_per_1k

# ===== 阈值常量(从 audit-loop.ts 同步) =====

DASH_MAX: int = 0
AI_VOCAB_PER_1K_MAX: float = 3.0
SENTENCE_SIGMA_MIN: float = 0.45
SIGMA_CHECK_MIN_LENGTH: int = 100

# ===== 句末标点正则(从 audit-loop.ts calcSentenceLengthSigma 同步) =====
# audit-loop.ts: text.split(/[。!?!?\n]+/)
# 注意:JS 的 [。!?!?\n] 和 Python 的同字符集行为一致
_SENTENCE_END_PATTERN = re.compile(r"[。!?!?\n]+")

# ===== 破折号正则(从 audit-loop.ts countDash 同步) =====
# audit-loop.ts: text.match(/[—–——]/g)
# JS 字符集 [—–——] 包含:em dash —, en dash –, 中文破折号 ——(实际是两个 em dash)
# Python 字符集写法一致
_DASH_PATTERN = re.compile(r"[—–——]")


# ===== 数据类 =====


@dataclass
class AnalysisMetrics:
    """文本分析指标结果。

    字段命名和 audit-loop.ts AuditOutput 对齐,
    便于后续 backend 直接消费。
    """

    dash_residual: int
    ai_vocab_per_1k: float
    sentence_length_sigma: float
    passed: bool
    failed_reasons: list[str] = field(default_factory=list)
    retry_hint: str | None = None
    sentence_count: int = 0


# ===== 核心函数 =====


def count_dash(text: str) -> int:
    """统计破折号数(em dash, en dash, 中文破折号)。

    对应 Node 版 audit-loop.ts 的 countDash()。
    JS: (text.match(/[—–——]/g) || []).length
    Python: len(re.findall(...))

    Args:
        text: 待检测文本

    Returns:
        破折号总数
    """
    return len(_DASH_PATTERN.findall(text))


def split_sentences(text: str) -> list[str]:
    """按中英文句末标点分句。

    对应 Node 版 audit-loop.ts 的 calcSentenceLengthSigma() 内部分句逻辑:
        text.split(/[。!?!?\n]+/).map(s => s.trim()).filter(s => s.length > 0)

    Args:
        text: 待分句文本

    Returns:
        句子列表(已 trim、已过滤空串)
    """
    parts = _SENTENCE_END_PATTERN.split(text)
    return [p.strip() for p in parts if p.strip()]


def calc_sentence_length_sigma(text: str) -> float:
    """计算句长变异系数(σ / 均值)。

    对应 Node 版 audit-loop.ts 的 calcSentenceLengthSigma()。

    归一化标准差,消除文本长度影响。
    人类文本约 0.45-0.7,AI 文本约 0.12-0.25。

    边界:
        - 句子 < 3:返回 0(Node 版同)
        - 均值 = 0:返回 0(Node 版同)

    Args:
        text: 待检测文本

    Returns:
        变异系数;句子太少(< 3)返回 0
    """
    sentences = split_sentences(text)
    if len(sentences) < 3:
        return 0.0

    lengths = [len(s) for s in sentences]
    n = len(lengths)
    mean = sum(lengths) / n

    if mean == 0:
        return 0.0

    variance = sum((l - mean) ** 2 for l in lengths) / n
    return (variance ** 0.5) / mean


def analyze(text: str) -> AnalysisMetrics:
    """综合分析:跑所有自检指标,返回是否通过 + 失败原因。

    对应 Node 版 audit-loop.ts 的 audit() 函数。

    判定逻辑(从 audit.ts 同步,严禁改动):
        - dash_residual > 0       → 失败
        - ai_vocab_per_1k >= 3.0  → 失败
        - sentence_length_sigma <= 0.45 且 text 长度 >= 100 → 失败

    Args:
        text: 待分析文本(LLM 改写后的文本)

    Returns:
        AnalysisMetrics
    """
    dash_residual = count_dash(text)
    ai_vocab_per_1k = count_ai_vocab_per_1k(text)

    # Node 版逻辑:text.length >= SIGMA_CHECK_MIN_LENGTH 才算 σ,否则给 1.0(默认通过)
    if len(text) >= SIGMA_CHECK_MIN_LENGTH:
        sentence_length_sigma = calc_sentence_length_sigma(text)
    else:
        sentence_length_sigma = 1.0

    failed_reasons: list[str] = []

    if dash_residual > DASH_MAX:
        failed_reasons.append(f"破折号残留 {dash_residual} 处(必须为 0)")

    if ai_vocab_per_1k >= AI_VOCAB_PER_1K_MAX:
        failed_reasons.append(
            f"AI 口癖词 {ai_vocab_per_1k:.1f}/千字(目标 < {AI_VOCAB_PER_1K_MAX})"
        )

    if (
        sentence_length_sigma <= SENTENCE_SIGMA_MIN
        and len(text) >= SIGMA_CHECK_MIN_LENGTH
    ):
        failed_reasons.append(
            f"句长变异系数 {sentence_length_sigma:.2f}(目标 > {SENTENCE_SIGMA_MIN})"
        )

    passed = len(failed_reasons) == 0
    retry_hint = None if passed else "; ".join(failed_reasons)

    sentence_count = len(split_sentences(text))

    return AnalysisMetrics(
        dash_residual=dash_residual,
        ai_vocab_per_1k=ai_vocab_per_1k,
        sentence_length_sigma=sentence_length_sigma,
        passed=passed,
        failed_reasons=failed_reasons,
        retry_hint=retry_hint,
        sentence_count=sentence_count,
    )
