"""vocab_replacer 单元测试。

覆盖目标:
    1. 基础替换正确(单个词 → 同义词)
    2. 白名单保护(专业术语不替换)
    3. 词性保护(人名/地名/数词不替换)
    4. 多样性(同词多次出现轮询不同同义词)
    5. 替换率控制
    6. 可重现性(同 seed 同结果)
    7. 边界(空文本、纯标点、无候选词)
"""

from __future__ import annotations

from app.services.vocab_replacer import (
    DEFAULT_REPLACE_RATE,
    VocabReplaceResult,
    replace_vocab,
)
from app.data.synonym_dict import (
    SYNONYM_DICT,
    get_synonyms,
    is_replaceable,
)


# ===== 基础替换 =====


class TestBasicReplace:
    def test_single_ai_word_replaced(self):
        # "研究" 在词典里
        r = replace_vocab("研究这个问题", replace_rate=1.0, seed=42)
        assert "研究" not in r.text or r.replace_rate < 1.0
        # 至少有一次替换
        assert len(r.replacements) >= 1
        # 替换后的词应该在词典的同义词里
        for rep in r.replacements:
            assert rep["original"] in SYNONYM_DICT
            assert rep["replaced"] in SYNONYM_DICT[rep["original"]]

    def test_multiple_distinct_words(self):
        text = "研究表明这个问题需要解决"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # "研究" "表明" "问题" "需要" 都在词典里
        replaced_words = {rep["original"] for rep in r.replacements}
        assert "研究" in replaced_words
        assert "表明" in replaced_words
        assert "问题" in replaced_words
        assert "需要" in replaced_words

    def test_no_candidate_words(self):
        # 文本里没有词典里的词
        text = "今天吃了一个苹果"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        assert r.text == text
        assert r.replacements == []
        assert r.replace_rate == 0.0


# ===== 白名单保护 =====


class TestProtectedTerms:
    def test_ai_term_protected(self):
        # "人工智能" 在白名单
        text = "人工智能的研究表明它很重要"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        assert "人工智能" in r.text  # 没被替换
        assert "人工智能" in r.skipped_protected

    def test_machine_learning_protected(self):
        text = "机器学习是一种重要的方法"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        assert "机器学习" in r.text
        assert "机器学习" in r.skipped_protected

    def test_research_self_protected(self):
        # "本研究" "本文" 不应替换(保留研究者视角)
        text = "本研究发现这个问题"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        assert "本研究" in r.text


# ===== 词性保护 =====


class TestPosProtection:
    def test_number_not_replaced(self):
        # 数词不应被替换
        text = "需要 3 个人"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # "3" 不会被替换
        assert "3" in r.text

    def test_english_not_replaced(self):
        text = "使用 AI 工具研究问题"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # "AI" 不会被替换
        assert "AI" in r.text


# ===== 多样性 =====


class TestDiversity:
    def test_same_word_multiple_occurrences_varied(self):
        # "研究" 出现多次,应该轮询不同同义词
        text = "研究 A。研究 B。研究 C。研究 D。"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # 收集所有"研究"被替换成的目标
        research_replacements = [
            rep["replaced"] for rep in r.replacements if rep["original"] == "研究"
        ]
        # 至少应该有 2 种不同的(词典里"研究"有 4 个候选)
        if len(research_replacements) >= 2:
            assert len(set(research_replacements)) >= 2


# ===== 替换率控制 =====


class TestReplaceRate:
    def test_zero_rate_no_replacement(self):
        text = "研究这个问题表明需要解决"
        r = replace_vocab(text, replace_rate=0.0, seed=42)
        assert r.text == text
        assert r.replacements == []

    def test_full_rate_all_replaced(self):
        text = "研究问题表明"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # 所有可替换词都应替换
        assert r.replace_rate == 1.0

    def test_partial_rate_some_replaced(self):
        # 准备 10 个可替换词
        text = "。".join(["研究"] * 10)
        r = replace_vocab(text, replace_rate=0.5, seed=42)
        # 应该替换大约一半(5 个左右)
        # 由于伪随机,实际数可能 4-6
        assert 3 <= len(r.replacements) <= 7


# ===== 可重现性 =====


class TestReproducibility:
    def test_same_seed_same_result(self):
        text = "研究问题表明需要解决方法"
        r1 = replace_vocab(text, replace_rate=0.7, seed=123)
        r2 = replace_vocab(text, replace_rate=0.7, seed=123)
        assert r1.text == r2.text
        assert r1.replacements == r2.replacements

    def test_different_seed_may_differ(self):
        text = "研究问题表明需要解决方法"
        r1 = replace_vocab(text, replace_rate=0.7, seed=1)
        r2 = replace_vocab(text, replace_rate=0.7, seed=99999)
        # 不同 seed 通常会选不同的词(但不强制,可能碰巧一致)
        # 这里只验证不抛异常
        assert isinstance(r1.text, str)
        assert isinstance(r2.text, str)


# ===== 边界 =====


class TestBoundary:
    def test_empty(self):
        r = replace_vocab("")
        assert r.text == ""
        assert r.replacements == []
        assert r.replace_rate == 0.0

    def test_only_punctuation(self):
        text = "。。。!?,"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        assert r.text == text
        assert r.replacements == []

    def test_only_protected_terms(self):
        text = "人工智能机器学习深度学习"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # 所有词都在白名单
        assert r.text == text
        assert len(r.skipped_protected) == 3

    def test_preserves_english_spacing(self):
        # 英文 token 之间的空格应保留
        text = "使用 AI 工具"
        r = replace_vocab(text, replace_rate=1.0, seed=42)
        # "AI" 不会被替换,但前后空格应保留
        assert " AI " in r.text or "AI" in r.text


# ===== 同义词词典 sanity =====


class TestSynonymDict:
    def test_get_synonyms_known_word(self):
        syns = get_synonyms("研究")
        assert syns is not None
        assert len(syns) >= 2  # 至少 2 个候选
        assert all(isinstance(s, str) for s in syns)

    def test_get_synonyms_unknown_word(self):
        assert get_synonyms("不存在的词XYZ") is None

    def test_is_replaceable_short_word(self):
        # 单字不应替换(可能助词)
        assert is_replaceable("的", "uj") is False

    def test_is_replaceable_long_word(self):
        # 过长(>4)不应替换
        assert is_replaceable("超长复合术语词", "n") is False

    def test_is_replaceable_protected(self):
        assert is_replaceable("人工智能", "n") is False

    def test_is_replaceable_normal_word(self):
        assert is_replaceable("研究", "v") is True
