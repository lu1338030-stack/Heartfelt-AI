"""Phase 1 自测脚本 - Python 侧。

用 text_analyzer.analyze 跑和 parity-node.ts 完全一致的样本,
然后对比 Node 输出的 JSON,验证数值一致(误差 < 0.01)。

用法:
    # 1. 先在 backend 跑 Node 脚本生成 JSON
    cd backend && npx ts-node scripts/parity-node.ts > ../ai-service/tests/parity-node-output.json

    # 2. 再在 ai-service 跑 Python 对比
    cd ai-service && uv run python tests/parity_test.py

退出码 0 = 全部一致,1 = 有差异。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# 让 tests/ 目录可导入 app 包
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.text_analyzer import analyze  # noqa: E402

# 和 parity-node.ts 完全一致的样本(单点真理,改动需两边同步)
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
]


def load_node_output() -> list[dict[str, Any]] | None:
    """加载 Node 脚本输出的 JSON。"""
    node_json_path = Path(__file__).parent / "parity-node-output.json"
    if not node_json_path.exists():
        print(f"[WARN] Node 输出文件不存在: {node_json_path}")
        print("       请先在 backend 目录运行:")
        print("       npx ts-node scripts/parity-node.ts > "
              "../ai-service/tests/parity-node-output.json")
        return None
    return json.loads(node_json_path.read_text(encoding="utf-8"))


def run_python() -> list[dict[str, Any]]:
    """跑 Python 实现,返回和 Node 同结构的结果。"""
    results = []
    for s in SAMPLES:
        text = s["text"]
        metrics = analyze(text)
        results.append(
            {
                "name": s["name"],
                "text": text,
                "text_length": len(text),
                "metrics": {
                    "dash_residual": metrics.dash_residual,
                    "ai_vocab_per_1k": metrics.ai_vocab_per_1k,
                    "sentence_length_sigma": metrics.sentence_length_sigma,
                    "passed": metrics.passed,
                    "failed_reasons": metrics.failed_reasons,
                    "retry_hint": metrics.retry_hint,
                },
            }
        )
    return results


def compare(node_results: list[dict[str, Any]], py_results: list[dict[str, Any]]) -> bool:
    """对比 Node 和 Python 输出,返回是否全部一致。"""
    if len(node_results) != len(py_results):
        print(f"[FAIL] 样本数不一致: Node={len(node_results)} Py={len(py_results)}")
        return False

    all_ok = True
    numeric_tolerance = 0.01

    for node_item, py_item in zip(node_results, py_results):
        name = node_item["name"]
        if name != py_item["name"]:
            print(f"[FAIL] 样本顺序错位: Node={name} Py={py_item['name']}")
            all_ok = False
            continue

        # 文本长度先对齐
        if node_item["text_length"] != py_item["text_length"]:
            print(
                f"[{name}] text_length 不一致: "
                f"Node={node_item['text_length']} Py={py_item['text_length']}"
            )
            all_ok = False

        node_m = node_item["metrics"]
        py_m = py_item["metrics"]

        # 数值字段:允许误差
        for field in ("dash_residual",):
            if node_m[field] != py_m[field]:
                print(f"[{name}] {field}: Node={node_m[field]} Py={py_m[field]}")
                all_ok = False

        for field in ("ai_vocab_per_1k", "sentence_length_sigma"):
            diff = abs(node_m[field] - py_m[field])
            if diff > numeric_tolerance:
                print(
                    f"[{name}] {field}: Node={node_m[field]:.6f} "
                    f"Py={py_m[field]:.6f} diff={diff:.6f} > {numeric_tolerance}"
                )
                all_ok = False

        # 布尔字段:严格一致
        if node_m["passed"] != py_m["passed"]:
            print(f"[{name}] passed: Node={node_m['passed']} Py={py_m['passed']}")
            all_ok = False

        # failed_reasons:列表内容需一致(允许顺序差异)
        node_reasons = sorted(node_m["failed_reasons"])
        py_reasons = sorted(py_m["failed_reasons"])
        # Node 和 Python 的 failed_reasons 字符串可能略有格式差异
        # (浮点格式化的 ":.1f" vs ":.1f"),做归一化
        if _normalize_reasons(node_reasons) != _normalize_reasons(py_reasons):
            print(f"[{name}] failed_reasons 差异:")
            print(f"  Node: {node_reasons}")
            print(f"  Py:   {py_reasons}")
            all_ok = False

        if all_ok:
            status = "PASS" if node_m["passed"] else "FAIL(text)"
            print(
                f"[{name}] OK  dash={py_m['dash_residual']} "
                f"ai_vocab/1k={py_m['ai_vocab_per_1k']:.3f} "
                f"sigma={py_m['sentence_length_sigma']:.3f} "
                f"passed={py_m['passed']} ({status})"
            )

    return all_ok


def _normalize_reasons(reasons: list[str]) -> list[str]:
    """归一化 failed_reasons 字符串,消除浮点格式差异。"""
    import re

    out = []
    for r in reasons:
        # 把 "3.0" → "3", "1.50" → "1.5" 等
        r2 = re.sub(r"(\d+)\.0\b", r"\1", r)
        r2 = re.sub(r"(\d+\.\d*?)0+\b", r"\1", r2)
        out.append(r2)
    return sorted(out)


def main() -> int:
    print("=" * 70)
    print("Phase 1 Parity Test: Python text_analyzer vs Node audit-loop")
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

    ok = compare(node_results, py_results)

    print("-" * 70)
    print()
    if ok:
        print("[RESULT] 全部一致 - Python 实现和 Node 数值匹配 (误差 < 0.01)")
        return 0
    else:
        print("[RESULT] 存在差异 - 需要排查")
        return 1


if __name__ == "__main__":
    sys.exit(main())
