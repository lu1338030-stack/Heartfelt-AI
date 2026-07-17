"""词级替换器 - 用 jieba 分词做细粒度同义词替换。

对应 Grok 方案维度 4(词汇选择与多样性)。
Node 端做不到的能力:Node 只能正则替换固定短语,
无法做"显著的 → 明显地/颇为"这类基于分词的灵活替换。

设计原则:
    1. 保守替换:只在确认是 AI 高频词时替换,避免破坏专业术语
    2. 保留词性:名词换名词,动词换动词(用 jieba pos)
    3. 白名单保护:专业术语、人名、地名不替换
    4. 多样性:同一段里同一个词不要全部替换成同一个
       (避免出现 5 个"明显地"——又变成 AI 模板了)
    5. 替换率控制:不要把所有 AI 词都换掉,留一部分维持自然感
       (Grok 维度 4:适当使用,过度替换反而像机器)

工作流:
    text
      ↓ jieba.posseg.cut (带词性分词)
    [(word, pos), ...]
      ↓ 过滤:is_replaceable(word, pos) and get_synonyms(word)
    [(word, pos, candidates), ...]
      ↓ 选择策略:轮询/哈希分散
    [(word, pos, chosen), ...]
      ↓ 重组
    new_text
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import jieba
import jieba.posseg as pseg

from app.data.synonym_dict import (
    PROTECTED_TERMS,
    SYNONYM_DICT,
    get_synonyms,
    is_replaceable,
)

# 关掉 jieba 的启动日志(否则每次 import 会打 "Loading model ..." 一堆)
jieba.setLogLevel("WARN")

# 把白名单里的多字术语显式注册给 jieba,确保分词时不会被切碎。
# 例如 "机器学习" 默认词典可能切成 "机器" + "学习",
# 注册后 jieba 会把它当作一个整体 token。
# 必须在第一次分词前调用(setLogLevel 之后就立即生效)。
for term in PROTECTED_TERMS:
    if len(term) >= 2:
        jieba.add_word(term, freq=1000, tag="n")


# ===== 输出类型 =====


@dataclass
class VocabReplaceResult:
    """词级替换结果。"""

    text: str
    """替换后的文本"""

    replacements: list[dict]
    """替换明细:[{ "original": "研究", "pos": "v", "replaced": "考察", "index": 3 }, ...]"""

    replace_rate: float
    """实际替换率 = 已替换词数 / 可替换词数"""

    skipped_protected: list[str]
    """被白名单保护未替换的词(便于排查误判)"""


# ===== 配置 =====

DEFAULT_REPLACE_RATE: float = 0.6
"""默认替换率:可替换词中随机选 60% 替换,留 40% 维持自然感。

Grok 维度 4 强调"适当使用",全替换会显得刻意。
0.6 是经验值,可调。
"""


# ===== 主函数 =====


def replace_vocab(
    text: str,
    replace_rate: float = DEFAULT_REPLACE_RATE,
    seed: int | None = None,
) -> VocabReplaceResult:
    """对文本做词级同义词替换。

    Args:
        text: 待处理文本(通常是 rule_engine 跑过后的文本)
        replace_rate: 替换率 [0, 1],控制实际替换的可替换词占比
        seed: 随机种子,相同种子产相同结果(便于测试可重现)。None = 用文本哈希

    Returns:
        VocabReplaceResult

    替换策略:
        1. jieba 带词性分词
        2. 过滤出可替换词(is_replaceable + 在同义词词典里)
        3. 按 replace_rate 比例选择要替换的词
        4. 对每个要替换的词,从候选里轮询选(避免重复同义词)
        5. 拼回文本
    """
    if not text:
        return VocabReplaceResult(
            text="",
            replacements=[],
            replace_rate=0.0,
            skipped_protected=[],
        )

    # 1. 带词性分词
    # pseg.cut 返回 generator of pair(obj.word, obj.flag)
    words_with_pos: list[tuple[str, str]] = [
        (w.word, w.flag) for w in pseg.cut(text)
    ]

    # 2. 找出可替换的候选位置
    candidates: list[tuple[int, str, str, tuple[str, ...]]] = []
    # [(token_index, word, pos, synonyms), ...]
    skipped_protected: list[str] = []
    seen_protected: set[str] = set()

    for i, (word, pos) in enumerate(words_with_pos):
        # 白名单保护
        if word in PROTECTED_TERMS:
            if word not in seen_protected:
                skipped_protected.append(word)
                seen_protected.add(word)
            continue

        if not is_replaceable(word, pos):
            continue

        syns = get_synonyms(word)
        if syns is None or len(syns) == 0:
            continue

        candidates.append((i, word, pos, syns))

    # 3. 按 replace_rate 决定实际替换哪些
    # 用确定性哈希选词(便于测试可重现),不引入 random 模块
    actual_seed = seed if seed is not None else _hash_text(text)
    selected_indices = _select_by_rate(
        [c[0] for c in candidates], replace_rate, actual_seed
    )
    selected_set = set(selected_indices)

    # 4. 对每个选中的词,选一个同义词
    # 策略:用文本内"该词第几次出现"做轮询索引,避免同词全换成同一个
    word_occurrence: dict[str, int] = {}
    replacement_map: dict[int, str] = {}  # token_index -> chosen synonym
    replacements: list[dict] = []

    for i, word, pos, syns in candidates:
        if i not in selected_set:
            continue

        # 该词的第几次出现(用于轮询选同义词)
        occurrence = word_occurrence.get(word, 0)
        word_occurrence[word] = occurrence + 1

        # 轮询选:syns[occurrence % len(syns)]
        chosen = syns[occurrence % len(syns)]
        replacement_map[i] = chosen

        replacements.append(
            {
                "original": word,
                "pos": pos,
                "replaced": chosen,
                "index": i,
            }
        )

    # 5. 拼回文本(保留分隔符,jieba 分词结果不丢空格)
    # jieba 分词会把标点也分成 token,直接拼接即可(中文不需要空格)
    # 但要处理英文 token 之间的空格(避免 "AI工具" 变成 "A I 工具")
    out_tokens: list[str] = []
    for i, (word, pos) in enumerate(words_with_pos):
        if i in replacement_map:
            out_tokens.append(replacement_map[i])
        else:
            out_tokens.append(word)

    new_text = _reconstruct_text(text, words_with_pos, out_tokens)

    # 实际替换率
    replaceable_count = len(candidates)
    actual_replaced = len(replacements)
    rate = actual_replaced / replaceable_count if replaceable_count > 0 else 0.0

    return VocabReplaceResult(
        text=new_text,
        replacements=replacements,
        replace_rate=rate,
        skipped_protected=skipped_protected,
    )


# ===== 工具函数 =====


def _hash_text(text: str) -> int:
    """对文本做确定性哈希,用作随机选择的种子。"""
    h = hashlib.md5(text.encode("utf-8")).hexdigest()
    return int(h[:8], 16)


def _select_by_rate(
    indices: list[int], rate: float, seed: int
) -> list[int]:
    """按 rate 比例从 indices 里选出一批。

    用线性同余生成器(LCG)做伪随机选择,避免引入 random 模块。
    相同 seed + 相同 indices → 相同结果。
    """
    if not indices or rate <= 0:
        return []
    if rate >= 1:
        return list(indices)

    target_count = max(1, round(len(indices) * rate))
    if target_count >= len(indices):
        return list(indices)

    # LCG 简单实现
    # 选 target_count 个不重复的索引位置
    selected: list[int] = []
    pool = list(range(len(indices)))  # indices 在 pool 里的位置
    a = 1103515245
    c = 12345
    m = 2**31
    state = seed % m

    while len(selected) < target_count and pool:
        state = (a * state + c) % m
        pick_pos = state % len(pool)
        selected.append(indices[pool.pop(pick_pos)])

    return selected


def _reconstruct_text(
    original: str,
    original_tokens: list[tuple[str, str]],
    new_tokens: list[str],
) -> str:
    """根据分词结果重建文本。

    jieba.cut 对中文一般不需要空格,直接拼即可。
    但英文/数字 token 之间需要保留空格(原文本里有的话)。

    策略:
        1. 如果原文本里某两个 token 之间有空格,保留;
        2. 否则直接拼。
    """
    # 简化实现:用 original 找原始分隔符
    # 找每个 token 在原文中的位置,检查中间是否有空格
    result_parts: list[str] = []
    search_pos = 0

    for i, (orig_word, _) in enumerate(original_tokens):
        new_word = new_tokens[i]

        # 在原文中找 orig_word 的位置
        found = original.find(orig_word, search_pos)
        if found == -1:
            # 找不到(可能是 jieba 切错或特殊字符),直接拼
            result_parts.append(new_word)
            search_pos = len(original)  # 后面都直接拼
            continue

        # 检查上一个 token 结束到这个 token 开始之间是否有空格
        if search_pos < found:
            gap = original[search_pos:found]
            if " " in gap or "\t" in gap:
                result_parts.append(" ")

        result_parts.append(new_word)
        search_pos = found + len(orig_word)

    # 处理尾部
    if search_pos < len(original):
        result_parts.append(original[search_pos:])

    return "".join(result_parts)
