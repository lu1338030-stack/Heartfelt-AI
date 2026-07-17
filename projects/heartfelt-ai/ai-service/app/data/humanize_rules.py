"""降AI 规则引擎 · 规则数据。

从 backend/src/humanize/data/humanize-rules.ts 迁移。
- 18 条 deterministic 规则(正则直接替换)
- 7 条 flagged 规则(只标记位置,交给 LLM 语义处理)

规则引擎执行顺序(见 rule_engine.py):
    1. 先跑 flagged 标记(不改动文本,记录位置 + hint)
    2. 再跑 deterministic 替换(改动文本)
    3. 最后扫破折号残留(应 = 0)

flagged 先跑:它的正则匹配原始位置,deterministic 替换后位置会漂移。

迁移注意:
    JS 正则字符集 [,,，]? 等价于 Python [,\uFF0C]?(逗号 ASCII + 中文全角)
    JS replace 函数签名 (match, ...groups) → Python 用 callable(match_obj)
    JS 模板 $1 → Python 反引用 \\1 或 \\g<1>
    JS unicode \\u{1F600} → Python \\U0001F600(8 位)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

# ===== 类型定义 =====

ReplaceFn = Callable[[re.Match[str]], str]
"""deterministic 规则的替换函数签名,对应 JS 的 (match, ...groups) => string"""


@dataclass(frozen=True)
class DeterministicRule:
    """确定性规则 - 正则匹配后替换。

    对应 Node 版 DeterministicRule 接口。
    """

    id: str
    """规则 ID,如 'dash-zero'"""

    pattern: re.Pattern[str]
    """编译好的正则"""

    replace: str | ReplaceFn
    """替换:字符串或函数。字符串里 \\1 \\g<name> 是 Python 反引用语法"""

    reason: str
    """人读理由(返回给前端展示)"""

    skill_pattern: int | None = None
    """对应 humanizer skill 模式编号(1-33),可选"""


@dataclass(frozen=True)
class FlaggedRule:
    """flagged 规则 - 只标记位置不替换。

    对应 Node 版 FlaggedRule 接口。
    """

    id: str
    pattern: re.Pattern[str]
    pattern_name: str
    """模式名,如 '三段式'"""

    skill_pattern: int
    hint: str
    """给 LLM 的提示"""


# ===== deterministic 规则(18 条) =====
# 按优先级排列。破折号零容忍是硬约束,放第一条。


def _ai_vocab_batch_replace(m: re.Match[str]) -> str:
    """第 18 条 AI 腔词批量替换的回调。

    对应 Node 版 rule 18 的 replace 函数。
    """
    word = m.group(0)
    mapping = {
        "赋能": "支持",
        "助力": "帮助",
        "打造": "建立",
        "护航": "保障",
        "抓手": "手段",
        "闭环": "完整流程",
        "底层逻辑": "核心原理",
        "全方位": "全面",
        "多维度": "多角度",
        "全链路": "全流程",
    }
    return mapping.get(word, word)


DETERMINISTIC_RULES: tuple[DeterministicRule, ...] = (
    # 1. 破折号零容忍(硬约束)
    # JS: /[—–]|——|(\s)--(\s)|——/g
    # 注:JS 字符集 [—–] 含 em dash + en dash,后面的 —— 是冗余写法
    # Python 等价:匹配单个 em/en dash,或 --(两侧空白)
    # 但 JS 这个正则的 —— 在 [—–] 之后其实永远不命中(已被单字符吃掉),
    # 我们忠实复刻原始行为:只匹配 [—–] 单字符 + (\s)--(\s)
    # 实际替换函数 JS 永远返回 ','(注释也说"统一替换为逗号")
    DeterministicRule(
        id="dash-zero",
        pattern=re.compile(r"[—–]|(\s)--(\s)"),
        replace=",",
        reason="破折号替换为逗号(humanizer 硬约束:破折号是 AI 文本最强信号)",
        skill_pattern=1,
    ),
    # 2. 弯引号 → 直引号
    # JS: /[""'']/g + replace(match => '"' if match in ('"','"') else "'")
    # 弯双引号: U+201C (") U+201D (")
    # 弯单引号: U+2018 (') U+2019 (')
    DeterministicRule(
        id="curly-quotes",
        pattern=re.compile(r"[\u201C\u201D\u2018\u2019]"),
        # 用函数实现条件替换
        replace=lambda m: '"' if m.group(0) in ("\u201C", "\u201D") else "'",
        reason="弯引号替换为直引号(AI 生成常见特征)",
        skill_pattern=2,
    ),
    # 3. 表情符号剥离
    # JS: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}...]/gu
    # Python: 用 \U000XXXXX 表示 8 位 unicode
    DeterministicRule(
        id="emoji-strip",
        pattern=re.compile(
            "["
            "\U0001F600-\U0001F64F"  # Emoticons
            "\U0001F300-\U0001F5FF"  # Misc Symbols and Pictographs
            "\U0001F680-\U0001F6FF"  # Transport and Map
            "\U0001F700-\U0001F77F"  # Alchemical Symbols
            "\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
            "\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
            "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
            "\U0001FA00-\U0001FA6F"  # Chess Symbols
            "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
            "\u2600-\u26FF"  # Misc Symbols
            "\u2700-\u27BF"  # Dingbats
            "]"
        ),
        replace="",
        reason="删除表情符号(学术文本不应出现)",
        skill_pattern=3,
    ),
    # 4. Markdown 粗体 → 去标记
    # JS: /\*\*(.+?)\*\*/g, replace '$1'
    DeterministicRule(
        id="bold-markdown",
        pattern=re.compile(r"\*\*(.+?)\*\*"),
        # Python 反引用用 \1
        replace=r"\1",
        reason="去除 Markdown 粗体标记(散文化)",
        skill_pattern=4,
    ),
    # 5. 内联标题列表 → 散文化标记
    # JS: /-\s*\*\*(.+?):\*\*\s*(.+)/g, replace '$1方面,$2。'
    DeterministicRule(
        id="inline-header-list",
        pattern=re.compile(r"-\s*\*\*(.+?):\*\*\s*(.+)"),
        replace=r"\1方面,\2。",
        reason="内联标题列表改为散文化(LLM 会进一步调整)",
        skill_pattern=5,
    ),
    # 6. 分号清理 → 句号
    # JS: /[;；]/g → '。'
    DeterministicRule(
        id="semicolon-clean",
        pattern=re.compile(r"[;\uFF1B]"),
        replace="。",
        reason="分号改为句号(打破 AI 常见的分号堆砌长句)",
    ),
    # 7. AI 高频词:此外 → 另外,
    # JS: /此外[,,，]?/g → '另外,'
    # 字符集 [,,，]: 半角逗号(重复)+ 全角逗号 U+FF0C
    DeterministicRule(
        id="ai-vocab-furthermore",
        pattern=re.compile(r"此外[,\uFF0C]?"),
        replace="另外,",
        reason='"此外"是 AI 高频连接词,替换为"另外"',
        skill_pattern=7,
    ),
    # 8. AI 高频词:值得注意的是 → 删除
    DeterministicRule(
        id="ai-vocab-noteworthy",
        pattern=re.compile(r"值得注意的是[,\uFF0C]?"),
        replace="",
        reason='"值得注意的是"是 AI 腔,直接删除(让主句独立)',
        skill_pattern=7,
    ),
    # 9. AI 高频词:综上所述 → 基于这些数据,
    DeterministicRule(
        id="ai-vocab-inconclusion",
        pattern=re.compile(r"综上所述[,\uFF0C]?"),
        replace="基于这些数据,",
        reason='"综上所述"是 AI 模板词,替换为"基于这些数据"',
        skill_pattern=7,
    ),
    # 10. AI 高频词:具有重要的...意义 → 挺关键的
    # JS: /具有重要的.*?意义/g
    DeterministicRule(
        id="ai-vocab-significance",
        pattern=re.compile(r"具有重要的.*?意义"),
        replace="挺关键的",
        reason='"具有重要的...意义"是 AI 套话,替换为具体表述',
        skill_pattern=7,
    ),
    # 11. AI 高频词:产生显著影响 → 影响很大
    DeterministicRule(
        id="ai-vocab-significant-impact",
        pattern=re.compile(r"产生显著影响"),
        replace="影响很大",
        reason='"产生显著影响"是 AI 宣传腔,替换为朴素表达',
        skill_pattern=7,
    ),
    # 12. 填充短语:为了实现这一目标 → 为此,
    DeterministicRule(
        id="filler-achieve-goal",
        pattern=re.compile(r"为了实现这一目标[,\uFF0C]?"),
        replace="为此,",
        reason="填充短语压缩(AI 倾向冗余表达)",
        skill_pattern=11,
    ),
    # 13. 填充短语:在这个时间点 → 现在
    DeterministicRule(
        id="filler-at-this-time",
        pattern=re.compile(r"在这个时间点"),
        replace="现在",
        reason="填充短语压缩",
        skill_pattern=11,
    ),
    # 14. 协作痕迹:希望这对您有帮助 → 删除
    # JS: /希望这对您有帮助[!!!]?[。。]?/g
    # [!!!]: 0-3 个感叹号;[。。]: 0-2 个句号
    DeterministicRule(
        id="chatbot-artifact",
        pattern=re.compile(r"希望这对您有帮助[!]{0,3}[\u3002]{0,2}"),
        replace="",
        reason="删除 chatbot 协作痕迹",
        skill_pattern=13,
    ),
    # 15. 知识截止免责:截至.*训练数据 → 删除
    # JS: /截至.*?训练数据[。。]?/g
    DeterministicRule(
        id="cutoff-disclaimer",
        pattern=re.compile(r"截至.*?训练数据[\u3002]{0,2}"),
        replace="",
        reason="删除知识截止免责声明",
        skill_pattern=14,
    ),
    # 16. 谄媚语气:好问题!/您说得完全正确 → 删除
    # JS: /(好问题[!!!]?[。。]?)|(您说得完全正确[。。]?)/g
    DeterministicRule(
        id="sycophantic",
        pattern=re.compile(
            r"(好问题[!]{0,3}[\u3002]{0,2})|(您说得完全正确[\u3002]{0,2})"
        ),
        replace="",
        reason="删除谄媚语气",
        skill_pattern=15,
    ),
    # 17. 过度限定:可能潜在地/或许也许 → 可能
    # JS: /(可能潜在地)|(或许也许)/g
    DeterministicRule(
        id="excessive-hedge",
        pattern=re.compile(r"(可能潜在地)|(或许也许)"),
        replace="可能",
        reason="过度限定压缩为单一限定词",
        skill_pattern=18,
    ),
    # 18. AI 腔词批量替换(格子达高危词)
    # JS: /(赋能)|(助力)|.../g + 函数映射
    DeterministicRule(
        id="ai-vocab-batch",
        pattern=re.compile(
            r"(赋能)|(助力)|(打造)|(护航)|(抓手)|(闭环)|(底层逻辑)|(全方位)|(多维度)|(全链路)"
        ),
        replace=_ai_vocab_batch_replace,
        reason="AI 腔词替换为朴素表达(格子达高危词)",
        skill_pattern=7,
    ),
)


# ===== flagged 规则(7 条,只标记不替换) =====

FLAGGED_RULES: tuple[FlaggedRule, ...] = (
    # F1. 三段式
    # JS: /首先[,,，]?[\s\S]{1,100}?。[\s\S]{0,20}?其次[,,，]?[\s\S]{1,100}?。[\s\S]{0,20}?最后/g
    # [\s\S] 在 JS 里 = 任意字符(含换行),Python 直接用 . 配合 DOTALL 或 [^]
    # 这里 [\s\S]{1,100}? 用 Python 的 [\s\S]{1,100}? 等价(. 不行,因 . 默认不匹配换行)
    FlaggedRule(
        id="F1",
        pattern=re.compile(
            r"首先[,\uFF0C]?[\s\S]{1,100}?。[\s\S]{0,20}?其次[,\uFF0C]?[\s\S]{1,100}?。[\s\S]{0,20}?最后"
        ),
        pattern_name="三段式",
        skill_pattern=10,
        hint='此段含"首先/其次/最后"三段式结构,请打破对称,用非顺序的方式组织',
    ),
    # F2. 否定排比
    # JS: /(不仅仅是?[^^。]{1,60}?而是)|(不是[^^。]{1,60}?而是)/g
    FlaggedRule(
        id="F2",
        pattern=re.compile(
            r"(不仅仅是?[^^。]{1,60}?而是)|(不是[^^。]{1,60}?而是)"
        ),
        pattern_name="否定排比",
        skill_pattern=9,
        hint='此段含否定排比("不是A而是B"),请改为直接陈述 B',
    ),
    # F3. 系动词回避
    # JS: /作为[^^。]{1,40}?的(体现|证明|存在|表现|标志)/g
    FlaggedRule(
        id="F3",
        pattern=re.compile(r"作为[^^。]{1,40}?的(体现|证明|存在|表现|标志)"),
        pattern_name="系动词回避",
        skill_pattern=8,
        hint='此段用"作为…的体现/证明"回避了"是",请用简单系动词或重写',
    ),
    # F4. 虚假范围
    # JS: /从[^^。]{1,30}?到[^^。]{1,30}?[,，]?\s*从[^^。]{1,30}?到/g
    FlaggedRule(
        id="F4",
        pattern=re.compile(
            r"从[^^。]{1,30}?到[^^。]{1,30}?[,\uFF0C]?\s*从[^^。]{1,30}?到"
        ),
        pattern_name="虚假范围",
        skill_pattern=12,
        hint='此段含虚假范围排比("从A到B,从C到D"),请具体化',
    ),
    # F5. 公式化挑战展望
    # JS: /尽管[^^。]{1,60}?挑战[^^。]{0,40}?但仍[^^。]{1,40}?/g
    FlaggedRule(
        id="F5",
        pattern=re.compile(r"尽管[^^。]{1,60}?挑战[^^。]{0,40}?但仍[^^。]{1,40}?"),
        pattern_name="公式化挑战展望",
        skill_pattern=24,
        hint='此段是公式化挑战展望("尽管…挑战…但仍…"),请改为具体问题陈述',
    ),
    # F6. -ing 肤浅分析
    # JS: /(体现了|彰显了|展示了|反映了)[^^。]{0,10}?(的|了)/g
    FlaggedRule(
        id="F6",
        pattern=re.compile(
            r"(体现了|彰显了|展示了|反映了)[^^。]{0,10}?(的|了)"
        ),
        pattern_name="ing 肤浅分析",
        skill_pattern=21,
        hint='此段含"-ing 式肤浅分析"尾缀("体现了/彰显了…"),请具体说明如何体现',
    ),
    # F7. 模糊归因
    # JS: /(专家认为)|(有观察者指出)|(业内人士表示)|(学界普遍认为)/g
    FlaggedRule(
        id="F7",
        pattern=re.compile(
            r"(专家认为)|(有观察者指出)|(业内人士表示)|(学界普遍认为)"
        ),
        pattern_name="模糊归因",
        skill_pattern=23,
        hint='此段含模糊归因("专家认为"等),请补具体来源或删除',
    ),
)
