"""/analyze 路由 - 整合所有 Python 检测能力。

POST /analyze
    请求: {"text": "...", "scenario": "academic", ...}
    响应: AnalyzeResponse

工作流:
    1. (可选)规则引擎预处理 + 词级替换
    2. 文本指标分析(自检)
    3. (可选)PPL 检测
    4. 生成给 LLM 的精准 hint
    5. 综合判定 passed

降级策略:
    - torch 未装 → PPL 字段为 None,ppl_available=False
    - vocab_replacer 失败 → 跳过词级替换,返回原文
"""

from __future__ import annotations

import logging
import time
from collections import Counter

from fastapi import APIRouter, HTTPException

from app.schemas.analyze import (
    AnalyzeRequest,
    AnalyzeResponse,
    FlagHitBlock,
    LlmHintBlock,
    MetricsBlock,
    RuleHitBlock,
    VocabReplaceBlock,
)
from app.services.rule_engine import run_rule_engine
from app.services.text_analyzer import (
    AI_VOCAB_PER_1K_MAX,
    SENTENCE_SIGMA_MIN,
    analyze as analyze_text,
    split_sentences,
)
from app.services.vocab_replacer import replace_vocab

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", response_model=AnalyzeResponse)
@router.post("/", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """分析文本:规则预处理 + 自检 + PPL + LLM hint 生成。

    Phase 4 的核心价值:
        1. 把 Node 里的 audit/rule 一次性算完(消除 N+1 网络调用)
        2. 用 jieba 做更细的词级替换(Node 做不到)
        3. 生成精准 LLM hint(具体到句子和词)
    """
    t0 = time.perf_counter()

    # ===== 1. 规则预处理 + 词级替换 =====
    current_text = req.text
    rule_result = None
    vocab_result = None

    if req.do_preprocess:
        # 先规则引擎
        rule_result = run_rule_engine(req.text)
        current_text = rule_result.preprocessed_text

        # 再词级替换
        if req.do_vocab_replace:
            try:
                vocab_result = replace_vocab(
                    current_text,
                    replace_rate=req.vocab_replace_rate,
                )
                current_text = vocab_result.text
            except Exception as e:
                # 词级替换失败不阻塞,继续用规则引擎输出
                logger.warning("vocab_replacer 失败,跳过: %s", e)

    # ===== 2. 文本指标分析(基于预处理后的文本) =====
    metrics = analyze_text(current_text)

    # ===== 3. PPL 检测(可选,降级) =====
    ppl_value: float | None = None
    burstiness_value: float | None = None
    ppl_available = False

    if req.do_ppl:
        try:
            from app.services.perplexity_service import calc_ppl, is_model_loaded

            if is_model_loaded():
                ppl_raw = calc_ppl(current_text)
                ppl_value = ppl_raw["ppl"]
                burstiness_value = ppl_raw["burstiness"]
                ppl_available = True
            else:
                logger.debug("PPL 模型未加载,跳过")
        except Exception as e:
            # PPL 失败不阻塞,只标记不可用
            logger.warning("PPL 计算失败,降级: %s", e)

    # ===== 4. 生成 LLM hint(精准反馈) =====
    llm_hints = _build_llm_hints(
        text=current_text,
        metrics=metrics,
        rule_hits=rule_result.hits if rule_result else [],
        flags=rule_result.flags if rule_result else [],
        vocab_replacements=vocab_result.replacements if vocab_result else [],
        ppl=ppl_value,
        burstiness=burstiness_value,
    )

    # ===== 5. 综合判定 =====
    # passed 只看 Node 自检那 3 项(对应原 audit-loop 行为)
    # PPL 不达标不算 passed=False(交给 LLM 重试循环决定)
    passed = metrics.passed
    failed_reasons = metrics.failed_reasons

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    return AnalyzeResponse(
        preprocessed_text=current_text,
        metrics=MetricsBlock(
            dash_residual=metrics.dash_residual,
            ai_vocab_per_1k=metrics.ai_vocab_per_1k,
            sentence_length_sigma=metrics.sentence_length_sigma,
            sentence_count=metrics.sentence_count,
            ppl=ppl_value,
            burstiness=burstiness_value,
        ),
        rule_hits=[
            RuleHitBlock(rule_id=h.rule_id, count=h.count, reason=h.reason)
            for h in (rule_result.hits if rule_result else [])
        ],
        flags=[
            FlagHitBlock(
                pattern_name=f.pattern_name,
                positions=f.positions,
                hint=f.hint,
            )
            for f in (rule_result.flags if rule_result else [])
        ],
        vocab_replace=VocabReplaceBlock(
            replacements=vocab_result.replacements if vocab_result else [],
            replace_rate=vocab_result.replace_rate if vocab_result else 0.0,
            skipped_protected=vocab_result.skipped_protected
            if vocab_result
            else [],
        )
        if vocab_result
        else None,
        llm_hints=llm_hints,
        passed=passed,
        failed_reasons=failed_reasons,
        ppl_available=ppl_available,
        processing_ms=elapsed_ms,
    )


# ===== LLM hint 生成器 =====


def _build_llm_hints(
    text: str,
    metrics,
    rule_hits,
    flags,
    vocab_replacements: list[dict],
    ppl: float | None,
    burstiness: float | None,
) -> LlmHintBlock:
    """根据各项指标生成给 LLM 的精准 hint。

    这是 Python 侧的核心价值:
    把 audit-loop 抽象的"句长σ=0.32 不达标"翻译成 LLM 能听懂的
    "第 2、4 句句长过于接近,建议拆短"。

    三层 hint:
        - text_hints:文本级(自检失败原因)
        - sentence_hints:句子级(哪句太长/重复)
        - vocab_hints:词汇级(高频词清单)
        - ppl_hint:PPL 相关
    """
    text_hints: list[str] = []
    sentence_hints: list[str] = []
    vocab_hints: list[str] = []

    # ----- 文本级:自检失败原因 -----
    for reason in metrics.failed_reasons:
        text_hints.append(reason)

    # flagged 规则的 hint 也算文本级提示
    for f in flags:
        text_hints.append(f.hint)

    # ----- 句子级:句长分析 -----
    sentences = split_sentences(text)
    if len(sentences) >= 3:
        sentence_hints.extend(_analyze_sentence_patterns(sentences))

    # ----- 词汇级:高频词提示 -----
    vocab_hints.extend(_analyze_vocab_patterns(text, vocab_replacements))

    # ----- PPL 提示 -----
    ppl_hint = None
    if ppl is not None and ppl < 45:
        ppl_hint = _build_ppl_hint(ppl, burstiness)

    return LlmHintBlock(
        text_hints=text_hints,
        sentence_hints=sentence_hints,
        vocab_hints=vocab_hints,
        ppl_hint=ppl_hint,
    )


def _analyze_sentence_patterns(sentences: list[str]) -> list[str]:
    """分析句子级模式,生成具体 hint。"""
    hints: list[str] = []
    lengths = [len(s) for s in sentences]

    # 1. 找长度过于接近的连续句子(差 < 3 字)
    # AI 文本的标志:连续 3 句长度高度均匀
    for i in range(len(lengths) - 2):
        window = lengths[i : i + 3]
        if max(window) - min(window) < 3 and all(w > 15 for w in window):
            hints.append(
                f"第 {i+1}、{i+2}、{i+3} 句长度过于接近"
                f"({window[0]}、{window[1]}、{window[2]} 字),"
                "建议拆短一句或合长一句打破均匀感"
            )
            break  # 只提示一次,避免噪音

    # 2. 全段句长标准差过低
    if len(lengths) >= 3:
        mean = sum(lengths) / len(lengths)
        variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
        sigma = (variance ** 0.5) / mean if mean > 0 else 0
        if sigma < SENTENCE_SIGMA_MIN:
            # 找最短和最长的句,引导 LLM 拉开差距
            shortest_idx = lengths.index(min(lengths))
            longest_idx = lengths.index(max(lengths))
            hints.append(
                f"句长变异系数 {sigma:.2f}(目标 > {SENTENCE_SIGMA_MIN}),"
                f"最短第 {shortest_idx+1} 句({min(lengths)} 字),"
                f"最长第 {longest_idx+1} 句({max(lengths)} 字),"
                "建议制造更多长短差异"
            )

    # 3. 单句过长(> 50 字)
    for i, s in enumerate(sentences):
        if len(s) > 50:
            hints.append(
                f"第 {i+1} 句过长({len(s)} 字),建议在'地/的/得'或转折词处拆成两短句"
            )
            break  # 只提示一次

    return hints


def _analyze_vocab_patterns(
    text: str, vocab_replacements: list[dict]
) -> list[str]:
    """分析词汇级模式,生成高频词提示。"""
    hints: list[str] = []

    # 找出现 >= 3 次的 2-4 字中文词(可能的高频 AI 词)
    # 简化实现:用滑动窗口找重复 2-gram
    ngram_counts: Counter[str] = Counter()
    for n in (2, 3, 4):
        for i in range(len(text) - n + 1):
            gram = text[i : i + n]
            # 只数纯中文 gram
            if all("\u4e00" <= c <= "\u9fff" for c in gram):
                ngram_counts[gram] += 1

    high_freq = [(g, c) for g, c in ngram_counts.items() if c >= 3]
    high_freq.sort(key=lambda x: -x[1])

    if high_freq:
        top_words = ", ".join(f"'{g}'({c}次)" for g, c in high_freq[:5])
        hints.append(f"高频重复词: {top_words} - 建议至少替换一半为同义表达")

    # 词级替换反馈
    if vocab_replacements:
        replaced_originals = [r["original"] for r in vocab_replacements]
        if replaced_originals:
            hints.append(
                f"已自动替换 {len(replaced_originals)} 个 AI 高频词"
                f"({', '.join(set(replaced_originals[:5]))}),"
                "LLM 重写时请保留这些更自然的表达"
            )

    # 模板连接词检测
    template_words = ["首先", "其次", "最后", "此外", "综上所述", "值得注意的是"]
    found_templates = [w for w in template_words if text.count(w) >= 1]
    if found_templates:
        hints.append(
            f"仍含 AI 模板连接词: {', '.join(found_templates)} - "
            "请删除或换成自然过渡"
        )

    return hints


def _build_ppl_hint(ppl: float, burstiness: float | None) -> str:
    """根据 PPL 值生成对应的 LLM hint。

    阈值参考 ppl-checker.ts(PASS_THRESHOLD=45, HARD_FAIL=30)。
    """
    gap = 45 - ppl

    if gap <= 5:
        return (
            f"困惑度 PPL={ppl:.1f},目标 ≥ 45,差距 {gap:.1f}。"
            "当前文本可预测性偏高,**只需轻度调整**:把 2-3 个高频词换成低频同义词,"
            "把一句长句拆成两短句"
        )

    if gap <= 15:
        return (
            f"困惑度 PPL={ppl:.1f},目标 ≥ 45,差距 {gap:.1f}(中等)。"
            "**中度改写**提升不可预测性:至少 2 处句式重构(主被动/语序),"
            "4-6 个高频词换罕见同义词,确保段内有极短句和长句交替"
        )

    return (
        f"困惑度 PPL={ppl:.1f},目标 ≥ 45,差距 {gap:.1f}(较大)。"
        "**彻底重写句子结构**:整段每句换骨架(主被动/因果倒置/长短拆合),"
        "把所有高频词都换掉,打散常用搭配('随着...的发展'/'在...方面'),"
        "句长大幅波动(极短句 5-10 字 + 长句 35-50 字交替)"
    )
