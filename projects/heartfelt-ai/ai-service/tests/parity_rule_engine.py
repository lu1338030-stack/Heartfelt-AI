"""Phase 2 自测脚本 - Python 侧(规则引擎)。

用 rule_engine.run_rule_engine 跑和 parity-rule-engine.ts 完全一致的样本,
对比 Node 输出的 JSON,验证:
    - preprocessed_text 字符完全一致
    - dash_residual 一致
    - hits 的 rule_id / count 一致(reason 可能因文本细节略有差异但应一致)
    - flags 的 pattern_name / positions 一致

用法:
    # 1. 先在 backend 跑 Node 脚本
    cd backend && npx ts-node scripts/parity-rule-engine.ts

    # 2. 再在 ai-service 跑 Python 对比
    cd ai-service && uv run python tests/parity_rule_engine.py

退出码 0 = 全部一致,1 = 有差异。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.rule_engine import run_rule_engine  # noqa: E402

# 和 parity-rule-engine.ts 完全一致的样本
SAMPLES: list[dict[str, str]] = [
    {"name": "short_clean", "text": "今天天气不错。"},
    {
        "name": "with_dashes",
        "text": (
            "人工智能在教育领域的应用非常广泛—并且取得了显著成效。"
            "此外—研究者发现学生们对 AI 工具的接受度逐年上升。"
        ),
    },
    {
        "name": "academic_ai",
        "text": (
            "首先,人工智能技术的发展为教育领域带来了重要的变革。"
            "其次,AI 工具能够显著提升教学效率,助力个性化学习。"
            "此外,研究表明智能辅导系统对学生成绩有显著影响。"
            "最后,综上所述,人工智能在教育领域具有重要的意义。"
        ),
    },
    {
        "name": "marketing_ai",
        "text": (
            "本产品通过 AI 赋能,打造全方位的学习闭环。"
            "多维度分析学习数据,助力学生提升成绩。"
            "我们的解决方案具有不可磨灭的重要意义,助力教育行业革命性升级。"
        ),
    },
    {
        "name": "human_like",
        "text": (
            "教室里很吵。"
            "孩子们挤在窗口往外看,有人踮脚,有人蹲下。"
            "外面在下雨。"
            "我站在门口,听着他们七嘴八舌地讨论明天的春游要不要改期。"
            "其实这事我也拿不准。"
            "天气预报说有雷阵雨,但谁知道呢?"
            "上次说下雨结果晴了一整天。"
            "我让他们先回座位,等会儿问问家长群。"
        ),
    },
    {"name": "empty", "text": ""},
    {"name": "ai_variant", "text": "研究表明,该方法显著提升了效率。"},
    {"name": "human_variant", "text": "效率这东西,我们试下来确实是涨了。"},
    # ===== 规则专项测试样本 =====
    {"name": "rule_curly_quotes", "text": "\u201C你好\u201D\u2018世界\u2019"},
    {"name": "rule_semicolon", "text": "第一;第二\uFF1B第三"},
    {"name": "rule_bold_markdown", "text": "这是 **粗体** 测试。"},
    {
        "name": "rule_chatbot_artifact",
        "text": "希望这对您有帮助!接下来我们看主内容。",
    },
    {
        "name": "rule_inline_header",
        "text": "- **优势**: 速度快\n- **劣势**: 成本高",
    },
    {
        "name": "rule_three_part",
        "text": "首先,我们做 A。其次,我们做 B。最后,我们做 C。",
    },
    {
        "name": "rule_negation_parallel",
        "text": "不是简单的工具,而是革命性的方法。",
    },
    {
        "name": "rule_vague_attribution",
        "text": "专家认为这个方案可行。",
    },
]


def load_node_output() -> list[dict[str, Any]] | None:
    node_json_path = Path(__file__).parent / "parity-rule-engine-output.json"
    if not node_json_path.exists():
        print(f"[WARN] Node 输出文件不存在: {node_json_path}")
        print("       请先在 backend 目录运行:")
        print("       npx ts-node scripts/parity-rule-engine.ts")
        return None
    return json.loads(node_json_path.read_text(encoding="utf-8"))


def run_python() -> list[dict[str, Any]]:
    results = []
    for s in SAMPLES:
        r = run_rule_engine(s["text"])
        results.append(
            {
                "name": s["name"],
                "text": s["text"],
                "result": {
                    "preprocessed_text": r.preprocessed_text,
                    "dash_residual": r.dash_residual,
                    "hits": [
                        {"rule_id": h.rule_id, "count": h.count, "reason": h.reason}
                        for h in r.hits
                    ],
                    "flags": [
                        {
                            "pattern_name": f.pattern_name,
                            "positions": f.positions,
                            "hint": f.hint,
                        }
                        for f in r.flags
                    ],
                },
            }
        )
    return results


def compare(
    node_results: list[dict[str, Any]], py_results: list[dict[str, Any]]
) -> tuple[bool, int]:
    """对比 Node 和 Python 输出,返回 (是否全部一致, 关键失败数)。"""
    if len(node_results) != len(py_results):
        print(f"[FAIL] 样本数不一致: Node={len(node_results)} Py={len(py_results)}")
        return False, 1

    all_ok = True
    critical_failures = 0

    for node_item, py_item in zip(node_results, py_results):
        name = node_item["name"]
        if name != py_item["name"]:
            print(f"[FAIL] 样本顺序错位: Node={name} Py={py_item['name']}")
            all_ok = False
            continue

        node_r = node_item["result"]
        py_r = py_item["result"]

        diffs: list[str] = []

        # 1. preprocessed_text 必须字符完全一致(核心目标)
        if node_r["preprocessed_text"] != py_r["preprocessed_text"]:
            diffs.append(
                f"  preprocessed_text 不一致:\n"
                f"    Node: {node_r['preprocessed_text']!r}\n"
                f"    Py:   {py_r['preprocessed_text']!r}"
            )
            critical_failures += 1

        # 2. dash_residual 必须一致
        if node_r["dash_residual"] != py_r["dash_residual"]:
            diffs.append(
                f"  dash_residual: Node={node_r['dash_residual']} "
                f"Py={py_r['dash_residual']}"
            )
            critical_failures += 1

        # 3. hits 的 rule_id + count 必须一致(reason 字符串允许差异)
        node_hits = {(h["rule_id"], h["count"]) for h in node_r["hits"]}
        py_hits = {(h["rule_id"], h["count"]) for h in py_r["hits"]}
        if node_hits != py_hits:
            only_node = node_hits - py_hits
            only_py = py_hits - node_hits
            diffs.append(
                f"  hits 不一致:\n"
                f"    Node only: {only_node}\n"
                f"    Py   only: {only_py}"
            )
            critical_failures += 1

        # 4. flags 的 pattern_name + positions 必须一致
        node_flags = {
            f["pattern_name"]: tuple(f["positions"]) for f in node_r["flags"]
        }
        py_flags = {f["pattern_name"]: tuple(f["positions"]) for f in py_r["flags"]}
        if node_flags != py_flags:
            diffs.append(
                f"  flags 不一致:\n"
                f"    Node: {node_flags}\n"
                f"    Py:   {py_flags}"
            )
            critical_failures += 1

        if diffs:
            all_ok = False
            print(f"[{name}] DIFF:")
            for d in diffs:
                print(d)
        else:
            hit_count = len(py_r["hits"])
            flag_count = len(py_r["flags"])
            print(
                f"[{name}] OK  hits={hit_count} flags={flag_count} "
                f"dash_residual={py_r['dash_residual']}"
            )

    return all_ok, critical_failures


def main() -> int:
    print("=" * 70)
    print("Phase 2 Parity Test: Python rule_engine vs Node rule-engine")
    print("=" * 70)
    print()

    node_results = load_node_output()
    if node_results is None:
        return 1

    py_results = run_python()

    print(f"样本数: {len(py_results)}")
    print()
    print("逐样本对比:")
    print("-" * 70)

    ok, critical = compare(node_results, py_results)

    print("-" * 70)
    print()
    if ok:
        print(
            "[RESULT] 全部一致 - Python 规则引擎和 Node 输出字符完全匹配"
        )
        return 0
    else:
        print(
            f"[RESULT] 存在差异 - {critical} 处关键字段不一致"
            "(preprocessed_text/dash_residual/hits/flags)"
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
