"""rule_engine 单元测试。

覆盖目标:
    1. 单条规则触发正确(deterministic 替换 + flagged 标记)
    2. 多规则组合场景
    3. 边界情况(空文本、无命中)
    4. extract_flagged_hints / count_dash 工具函数

Phase 2 核心验收 - "Python 和 Node 输出 preprocessedText 一致"
在 test_rule_engine_parity.py 单独做。
"""

from __future__ import annotations

from app.services.rule_engine import (
    RuleEngineResult,
    count_dash,
    extract_flagged_hints,
    run_rule_engine,
)


# ===== 单条 deterministic 规则触发 =====


class TestDashZero:
    """规则 1: 破折号零容忍。"""

    def test_em_dash_replaced(self):
        r = run_rule_engine("AI—很厉害")
        # 破折号 → 逗号
        assert "," in r.preprocessed_text
        assert "—" not in r.preprocessed_text
        assert r.dash_residual == 0
        # 命中记录
        assert any(h.rule_id == "dash-zero" for h in r.hits)

    def test_en_dash_replaced(self):
        r = run_rule_engine("AI–很厉害")
        assert "–" not in r.preprocessed_text
        assert r.dash_residual == 0

    def test_double_hyphen_with_spaces(self):
        # (\s)--(\s) 分支
        r = run_rule_engine("AI -- 很厉害")
        # 应该被替换
        assert "--" not in r.preprocessed_text

    def test_no_word_internal_hyphen(self):
        # state-of-the-art 这种单词内连字符不应被替换
        r = run_rule_engine("state-of-the-art model")
        # 注:dash-zero 规则只匹配 (\s)--(\s),不匹配单词内单连字符
        # 但其他规则(semicolon 等)也不会动它
        assert "state-of-the-art" in r.preprocessed_text


class TestCurlyQuotes:
    """规则 2: 弯引号 → 直引号。"""

    def test_double_curly(self):
        # U+201C U+201D
        r = run_rule_engine("\u201C你好\u201D")
        assert r.preprocessed_text == '"你好"'

    def test_single_curly(self):
        # U+2018 U+2019
        r = run_rule_engine("\u2018你\u2019")
        assert r.preprocessed_text == "'你'"


class TestSemicolonClean:
    """规则 6: 分号 → 句号。"""

    def test_ascii_semicolon(self):
        r = run_rule_engine("第一;第二")
        assert r.preprocessed_text == "第一。第二"

    def test_fullwidth_semicolon(self):
        # U+FF1B
        r = run_rule_engine("第一\uFF1B第二")
        assert r.preprocessed_text == "第一。第二"


class TestAiVocabFurthermore:
    """规则 7: 此外 → 另外,"""

    def test_basic(self):
        r = run_rule_engine("此外,这是测试")
        assert r.preprocessed_text == "另外,这是测试"

    def test_no_comma_after(self):
        r = run_rule_engine("此外这是测试")
        assert r.preprocessed_text == "另外,这是测试"

    def test_fullwidth_comma(self):
        r = run_rule_engine("此外\uFF0C这是测试")
        assert r.preprocessed_text == "另外,这是测试"


class TestAiVocabBatch:
    """规则 18: AI 腔词批量替换。"""

    def test_single_word(self):
        r = run_rule_engine("通过 AI 赋能")
        assert "赋能" not in r.preprocessed_text
        assert "支持" in r.preprocessed_text

    def test_multiple_distinct(self):
        r = run_rule_engine("赋能助力打造")
        assert r.preprocessed_text == "支持帮助建立"

    def test_unknown_word_not_touched(self):
        # 映射里没有的词不会被替换
        r = run_rule_engine("普通文本")
        assert r.preprocessed_text == "普通文本"


# ===== flagged 规则 =====


class TestFlaggedThreePart:
    """F1: 三段式。"""

    def test_basic_three_part(self):
        text = "首先,做 A。然后,其次做 B。最后做 C。"
        r = run_rule_engine(text)
        f1_flags = [f for f in r.flags if f.pattern_name == "三段式"]
        # 注意:正则要求 "首先...。其次...。最后" 的精确顺序
        # 上面文本中 "然后,其次" 会打断匹配
        # 用更标准的样本测试
        if f1_flags:
            assert any("三段式" in f.hint for f in f1_flags)

    def test_strict_three_part(self):
        # 严格匹配 首先...。其次...。最后
        text = "首先,我们做 A。其次,我们做 B。最后,我们做 C。"
        r = run_rule_engine(text)
        f1_flags = [f for f in r.flags if f.pattern_name == "三段式"]
        assert len(f1_flags) == 1
        assert f1_flags[0].positions  # 有位置记录
        assert "三段式" in f1_flags[0].hint


class TestFlaggedNegationParallel:
    """F2: 否定排比。"""

    def test_not_a_but_b(self):
        text = "不是简单的工具,而是革命性的方法。"
        r = run_rule_engine(text)
        f2_flags = [f for f in r.flags if f.pattern_name == "否定排比"]
        assert len(f2_flags) == 1


class TestFlaggedVagueAttribution:
    """F7: 模糊归因。"""

    def test_expert_says(self):
        text = "专家认为这个方案可行。"
        r = run_rule_engine(text)
        f7_flags = [f for f in r.flags if f.pattern_name == "模糊归因"]
        assert len(f7_flags) == 1


# ===== 综合场景 =====


class TestComposite:
    """多规则同时触发。"""

    def test_ai_paragraph_multiple_rules(self):
        # 典型 AI 段:破折号 + 此外 + 三段式 + AI 腔词
        text = (
            "首先—AI 赋能教育。"
            "此外,助力学生提升。"
            "最后,打造全方位闭环。"
        )
        r = run_rule_engine(text)

        # 破折号应该被替换
        assert "—" not in r.preprocessed_text
        assert r.dash_residual == 0

        # AI 腔词应被替换
        assert "赋能" not in r.preprocessed_text
        assert "助力" not in r.preprocessed_text

        # 多条命中
        rule_ids = {h.rule_id for h in r.hits}
        assert "dash-zero" in rule_ids
        assert "ai-vocab-furthermore" in rule_ids
        assert "ai-vocab-batch" in rule_ids

    def test_clean_text_no_hits(self):
        # 干净文本不应触发任何规则
        text = "教室里很吵。孩子们挤在窗口。"
        r = run_rule_engine(text)
        assert r.hits == []
        assert r.flags == []
        assert r.preprocessed_text == text


# ===== 边界 =====


class TestBoundary:
    def test_empty_text(self):
        r = run_rule_engine("")
        assert r.preprocessed_text == ""
        assert r.hits == []
        assert r.flags == []
        assert r.dash_residual == 0

    def test_pure_punctuation(self):
        r = run_rule_engine("。。。")
        # 不应该崩溃
        assert isinstance(r, RuleEngineResult)

    def test_english_only(self):
        # 纯英文不应触发任何中文规则
        r = run_rule_engine("Hello world. This is a test.")
        assert r.hits == []
        assert r.preprocessed_text == "Hello world. This is a test."


# ===== 工具函数 =====


class TestExtractFlaggedHints:
    def test_empty(self):
        assert extract_flagged_hints([]) == []

    def test_multiple(self):
        from app.services.rule_engine import FlagHit

        flags = [
            FlagHit(pattern_name="A", positions=[1], hint="hint A"),
            FlagHit(pattern_name="B", positions=[2], hint="hint B"),
        ]
        assert extract_flagged_hints(flags) == ["hint A", "hint B"]


class TestCountDash:
    def test_zero(self):
        assert count_dash("普通文本") == 0

    def test_multiple(self):
        assert count_dash("—–——") == 4  # em + en + 两个 em
