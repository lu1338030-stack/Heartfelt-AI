"""规则引擎执行器。

从 backend/src/humanize/lib/rule-engine.ts 迁移。

流程(对应 plan/humanize-module.md §3.4):
    1. 先跑 FLAGGED_RULES 标记(不改动文本,记录位置 + hint)
    2. 再跑 DETERMINISTIC_RULES 替换(改动文本,统计命中数)
    3. 最后扫破折号残留(应 = 0)

flagged 先跑:它的正则匹配原始位置,deterministic 替换后位置会漂移。

Phase 2 目标:
    和 Node rule-engine.ts 对同一文本输出 preprocessedText 字符完全一致。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.data.humanize_rules import (
    DETERMINISTIC_RULES,
    FLAGGED_RULES,
    DeterministicRule,
    FlaggedRule,
)

# ===== 输出类型 =====


@dataclass
class RuleHit:
    """deterministic 规则命中记录。对应 Node RuleHit。"""

    rule_id: str
    count: int
    reason: str


@dataclass
class FlagHit:
    """flagged 规则标记。对应 Node FlagHit。"""

    pattern_name: str
    positions: list[int]
    hint: str


@dataclass
class RuleEngineResult:
    """规则引擎总结果。对应 Node RuleEngineResult。"""

    preprocessed_text: str
    """规则替换后的文本"""

    hits: list[RuleHit] = field(default_factory=list)
    """deterministic 规则命中记录"""

    flags: list[FlagHit] = field(default_factory=list)
    """flagged 模式标记"""

    dash_residual: int = 0
    """破折号残留(规则后扫描,应为 0;非 0 说明规则有遗漏)"""


# ===== 主函数 =====

# 破折号扫描正则(从 rule-engine.ts countDash 同步,和 text_analyzer 一致)
_DASH_SCAN = re.compile(r"[—–——]")


def run_rule_engine(text: str) -> RuleEngineResult:
    """运行规则引擎。

    对应 Node 版 rule-engine.ts 的 runRuleEngine()。

    Args:
        text: 原始段文本

    Returns:
        RuleEngineResult
    """
    # 1. flagged 先跑(不改动 text,记录位置)
    flags = _run_flagged_rules(text)

    # 2. deterministic 替换(改动 text)
    preprocessed_text, hits = _run_deterministic_rules(text)

    # 3. 扫破折号残留
    dash_residual = len(_DASH_SCAN.findall(preprocessed_text))

    return RuleEngineResult(
        preprocessed_text=preprocessed_text,
        hits=hits,
        flags=flags,
        dash_residual=dash_residual,
    )


# ===== flagged 规则执行 =====


def _run_flagged_rules(text: str) -> list[FlagHit]:
    """跑 FLAGGED_RULES,返回所有标记。

    对应 Node 版 rule-engine.ts 的 runFlaggedRules()。
    用 regex.finditer() 拿所有匹配的起始位置(Python 等价 JS 的 regex.exec() 循环)。
    """
    flags: list[FlagHit] = []

    for rule in FLAGGED_RULES:
        positions: list[int] = []
        # Python finditer 自动全局匹配(等价 JS 带 g flag)
        safety_counter = 0
        for m in rule.pattern.finditer(text):
            positions.append(m.start())
            safety_counter += 1
            if safety_counter > 1000:  # 安全阀(对应 Node 版同名常量)
                break

        if positions:
            flags.append(
                FlagHit(
                    pattern_name=rule.pattern_name,
                    positions=positions,
                    hint=rule.hint,
                )
            )

    return flags


# ===== deterministic 规则执行 =====


def _run_deterministic_rules(text: str) -> tuple[str, list[RuleHit]]:
    """跑 DETERMINISTIC_RULES,逐条替换并统计命中数。

    对应 Node 版 rule-engine.ts 的 runDeterministicRules()。

    关键差异处理:
        Node 用 new RegExp(rule.pattern.source, rule.pattern.flags) 重新构造
        正则做"统计命中数"(因为某些规则可能不带 g flag,统计需要 g flag)。
        Python 的 re 模块里,编译过的 pattern 默认就是全局的(findall/finditer
        会找全部),所以不需要重新构造。

    Returns:
        (preprocessed_text, hits)
    """
    current = text
    hits: list[RuleHit] = []

    for rule in DETERMINISTIC_RULES:
        # 先统计命中数(在替换前)
        # Node: (current.match(regex) || []).length
        # Python: len(rule.pattern.findall(current))
        # 但 findall 对有 group 的正则返回 group 元组,
        # 而 JS match 对有 group 的正则(g flag)返回完整匹配数组,
        # 所以这里用 finditer 数 match 对象
        match_count = sum(1 for _ in rule.pattern.finditer(current))

        if match_count > 0:
            # 替换
            # Node: current.replace(rule.pattern, rule.replace as never)
            # JS String.replace 接受 RegExp + (string | function)
            # Python re.sub 接受 Pattern + (string | callable)
            current = rule.pattern.sub(rule.replace, current)
            hits.append(
                RuleHit(
                    rule_id=rule.id,
                    count=match_count,
                    reason=rule.reason,
                )
            )

    return current, hits


# ===== 工具函数 =====


def extract_flagged_hints(flags: list[FlagHit]) -> list[str]:
    """提取所有 flagged 的 hint(扁平化)。

    对应 Node 版 rule-engine.ts 的 extractFlaggedHints()。
    给 llm-rewriter 用,拼成 system prompt 第 7 层。
    """
    return [f.hint for f in flags]


def count_dash(text: str) -> int:
    """统计破折号数。

    和 text_analyzer.count_dash 行为一致,
    保留这个函数是因为 rule-engine.ts 里也有同名工具函数。
    """
    return len(_DASH_SCAN.findall(text))
