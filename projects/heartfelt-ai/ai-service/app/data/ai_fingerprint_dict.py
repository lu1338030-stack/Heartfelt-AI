"""AI 口癖词词典 + 统计函数。

从 backend/src/humanize/data/ai-fingerprint-dict.ts 迁移。
来源:
    - humanizer skill v2.8.2 中文化适配
    - 格子达实测高危词清单(3 个同现即触发 AI 腔判定)

Phase 1: 只迁数据 + 统计函数,确保和 Node 输出数值一致。
"""

from __future__ import annotations

# ===== 自检用的 AI 口癖词清单(格子达高危 + humanizer 中文适配) =====
# 注意:这里只列"需要统计"的词;能直接正则替换的进 rule_engine.py
AI_FINGERPRINT_WORDS: tuple[str, ...] = (
    # 模板连接词(规则引擎会替换一部分,自检兜底统计残留)
    "此外",
    "综上所述",
    "值得注意的是",
    "首先",
    "其次",
    "最后",
    "与此同时",
    "在此基础上",
    "进一步而言",
    "总而言之",
    "换言之",
    # 高频 AI 腔词
    "赋能",
    "助力",
    "打造",
    "护航",
    "抓手",
    "闭环",
    "底层逻辑",
    "全方位",
    "多维度",
    "全链路",
    "至关重要",
    "不可磨灭",
    "显著影响",
    "具有重要意义",
    "具有重要价值",
    "具有重要地位",
    # 谄媚/对话腔
    "众所周知",
    "不言而喻",
    "显而易见",
    # 宣传腔
    "革命性",
    "颠覆性",
    "划时代",
    "里程碑式",
    "开创性",
)


def count_ai_vocab(text: str) -> int:
    """统计文本中 AI 口癖词的绝对命中数。

    对应 Node 版 countAiVocab()。
    全文计数(重叠也算,用 str.find 滚动)。

    Args:
        text: 待检测文本

    Returns:
        命中总数
    """
    hits = 0
    for word in AI_FINGERPRINT_WORDS:
        idx = text.find(word)
        while idx != -1:
            hits += 1
            idx = text.find(word, idx + len(word))
    return hits


def count_ai_vocab_per_1k(text: str) -> float:
    """统计文本中 AI 口癖词出现频次(每千字)。

    对应 Node 版 countAiVocabPer1k()。
    人类文本 < 1,AI 文本通常 > 5。

    Args:
        text: 待检测文本

    Returns:
        每千字命中数(浮点)
    """
    if not text:
        return 0.0
    hits = count_ai_vocab(text)
    return (hits / len(text)) * 1000
