"""text_analyzer 单元测试。

覆盖目标:
    1. 基础函数行为正确(count_dash / split_sentences / sigma 等)
    2. analyze 综合函数返回结构正确
    3. 边界情况(空文本、短文本、句子<3)
    4. 阈值判定逻辑(各种 failed_reasons 组合)

Phase 1 的核心验收 - "Python 和 Node 数值一致" 在 test_text_analyzer_parity.py 单独做,
因为需要对照 Node 旧实现的输出。
"""

from __future__ import annotations

import pytest

from app.data.ai_fingerprint_dict import count_ai_vocab, count_ai_vocab_per_1k
from app.services.text_analyzer import (
    AI_VOCAB_PER_1K_MAX,
    DASH_MAX,
    SENTENCE_SIGMA_MIN,
    SIGMA_CHECK_MIN_LENGTH,
    AnalysisMetrics,
    analyze,
    calc_sentence_length_sigma,
    count_dash,
    split_sentences,
)


# ===== count_dash =====


class TestCountDash:
    def test_no_dash(self):
        assert count_dash("普通中文文本,没有任何破折号。") == 0

    def test_em_dash(self):
        # — (U+2014)
        assert count_dash("AI—很厉害") == 1

    def test_en_dash(self):
        # – (U+2013)
        assert count_dash("AI–很厉害") == 1

    def test_chinese_dash(self):
        # —— (两个 em dash,Node 正则 [—–——] 会匹配两次)
        # 注意:Node 正则把 —— 视为两个字符各匹配一次,Python 同行为
        assert count_dash("AI——很厉害") == 2

    def test_multiple_mixed(self):
        text = "首先—其次–最后——"
        # —(1) + –(1) + ——(2) = 4
        assert count_dash(text) == 4

    def test_empty(self):
        assert count_dash("") == 0


# ===== split_sentences =====


class TestSplitSentences:
    def test_chinese_period(self):
        assert split_sentences("你好。世界。") == ["你好", "世界"]

    def test_mixed_punctuation(self):
        result = split_sentences("你好。世界!再见?对。")
        assert result == ["你好", "世界", "再见", "对"]

    def test_newline_split(self):
        # \n 也是分隔符
        assert split_sentences("第一行\n第二行") == ["第一行", "第二行"]

    def test_consecutive_separators(self):
        # 多个连续分隔符视为一个(JS split 同行为)
        assert split_sentences("你好。。。世界") == ["你好", "世界"]

    def test_trim_whitespace(self):
        assert split_sentences("  你好  。 世界  ") == ["你好", "世界"]

    def test_empty_string(self):
        assert split_sentences("") == []

    def test_only_separators(self):
        assert split_sentences("。。。") == []


# ===== calc_sentence_length_sigma =====


class TestSentenceLengthSigma:
    def test_less_than_three_sentences(self):
        # 句子 < 3 返回 0
        assert calc_sentence_length_sigma("你好。世界。") == 0.0

    def test_uniform_length(self):
        # 三句长度完全一样 → σ=0 → 变异系数=0
        text = "一二三。四五六。七八九。"
        assert calc_sentence_length_sigma(text) == 0.0

    def test_varied_length(self):
        # 长度差异大 → 变异系数应该 > 0.4
        text = "短。这是一个比较长的句子用来制造长度差异。中。再来一个长句子确保方差够大。"
        sigma = calc_sentence_length_sigma(text)
        assert sigma > 0.4

    def test_empty(self):
        assert calc_sentence_length_sigma("") == 0.0


# ===== count_ai_vocab / count_ai_vocab_per_1k =====


class TestAiVocab:
    def test_no_ai_word(self):
        assert count_ai_vocab("今天是晴天,我们去公园散步。") == 0

    def test_single_word(self):
        assert count_ai_vocab("首先,我同意这个观点。") == 1

    def test_multiple_distinct_words(self):
        text = "首先,此外,综上所述,这都是 AI 套话。"
        # 命中:首先 / 此外 / 综上所述 = 3
        assert count_ai_vocab(text) == 3

    def test_repeated_word(self):
        # 同一词多次出现都计数
        text = "首先 A。首先 B。首先 C。"
        assert count_ai_vocab(text) == 3

    def test_per_1k_scaling(self):
        # 长文本的每千字统计
        text = "此外" + "无意义填充" * 100
        # text 长度 = 2 + 4*100 = 402
        # 命中 1 次 → 1/402*1000 ≈ 1.99
        per_1k = count_ai_vocab_per_1k(text)
        assert 1.5 < per_1k < 2.5

    def test_empty(self):
        assert count_ai_vocab("") == 0
        assert count_ai_vocab_per_1k("") == 0.0


# ===== analyze 综合函数 =====


class TestAnalyze:
    def test_clean_text_passes(self):
        text = "教室里很吵。孩子们挤在窗口往外看。外面在下雨。这是测试文本,长度需要超过一百字才能触发句长检查。" \
               "所以我在这里继续写。确保长度足够。然后看结果是否通过。再加几句凑长度。"
        result = analyze(text)
        assert isinstance(result, AnalysisMetrics)
        # 干净文本应该 pass(无破折号、无 AI 词、句长自然)
        assert result.dash_residual == 0

    def test_dash_fails(self):
        text = "AI—很厉害。这是测试文本—用来验证破折号检测。需要足够长度来避免被短文本逻辑跳过。" \
               "继续填充内容。再加一句。"
        result = analyze(text)
        assert result.dash_residual >= 1
        assert not result.passed
        assert any("破折号" in r for r in result.failed_reasons)

    def test_high_ai_vocab_fails(self):
        # 堆 AI 词,使每千字 > 3
        text = "首先此外综上所述。其次最后值得注意的是。换言之在此基础上进一步而言。"
        result = analyze(text)
        assert result.ai_vocab_per_1k >= AI_VOCAB_PER_1K_MAX
        assert any("AI 口癖词" in r for r in result.failed_reasons)

    def test_short_text_skips_sigma_check(self):
        # 短文本 < SIGMA_CHECK_MIN_LENGTH 时,sigma 设为 1.0(默认通过)
        text = "短文本。"
        result = analyze(text)
        assert result.sentence_length_sigma == 1.0
        # 短文本不触发 sigma 失败
        assert not any("句长" in r for r in result.failed_reasons)

    def test_empty_text(self):
        result = analyze("")
        assert result.dash_residual == 0
        assert result.ai_vocab_per_1k == 0.0
        # 空文本长度 < 100,sigma=1.0
        assert result.sentence_length_sigma == 1.0
        assert result.passed is True
        assert result.failed_reasons == []

    def test_retry_hint_none_when_passed(self):
        result = analyze("干净的短文本。")
        assert result.passed is True
        assert result.retry_hint is None

    def test_retry_hint_joined_when_failed(self):
        text = "首先此外。—"
        result = analyze(text)
        assert result.retry_hint is not None
        # retry_hint 是失败原因的 "; " 连接
        assert ";" in result.retry_hint or "," in result.retry_hint

    def test_sentence_count(self):
        result = analyze("第一句。第二句。第三句。")
        assert result.sentence_count == 3


# ===== 阈值常量 sanity check =====


class TestThresholdConstants:
    """确认阈值和 Node audit-loop.ts 完全一致。"""

    def test_dash_max(self):
        assert DASH_MAX == 0

    def test_ai_vocab_threshold(self):
        assert AI_VOCAB_PER_1K_MAX == 3.0

    def test_sigma_min(self):
        assert SENTENCE_SIGMA_MIN == 0.45

    def test_sigma_check_min_length(self):
        assert SIGMA_CHECK_MIN_LENGTH == 100
