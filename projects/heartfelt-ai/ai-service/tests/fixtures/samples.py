"""测试样本库 - 中间层。

所有用于对比 Node 旧实现的测试样本都集中在这里,
便于 Python 测试和 Node 对照脚本使用同一批数据。

样本设计原则:
    - 覆盖典型 AI 文本特征(破折号、模板词、句长均匀)
    - 覆盖边界情况(空文本、短文本)
    - 覆盖人类风格文本(验证不误伤)
"""

from __future__ import annotations

# ===== 测试样本 =====

# 短文本 - 不触发句长σ检查(< 100 字)
SAMPLE_SHORT_CLEAN: str = "今天天气不错。"

# 含破折号的 AI 风格文本(破折号需被检测到)
SAMPLE_WITH_DASHES: str = (
    "人工智能在教育领域的应用非常广泛—并且取得了显著成效。"
    "此外—研究者发现学生们对 AI 工具的接受度逐年上升。"
)

# 典型 AI 学术文本(模板词堆砌 + 句长均匀)
SAMPLE_ACADEMIC_AI: str = (
    "首先,人工智能技术的发展为教育领域带来了重要的变革。"
    "其次,AI 工具能够显著提升教学效率,助力个性化学习。"
    "此外,研究表明智能辅导系统对学生成绩有显著影响。"
    "最后,综上所述,人工智能在教育领域具有重要的意义。"
)

# 典型 AI 营销腔(高频 AI 词)
SAMPLE_MARKETING_AI: str = (
    "本产品通过 AI 赋能,打造全方位的学习闭环。"
    "多维度分析学习数据,助力学生提升成绩。"
    "我们的解决方案具有不可磨灭的重要意义,助力教育行业革命性升级。"
)

# 人类风格文本(句长不均,无模板词)
SAMPLE_HUMAN_LIKE: str = (
    "教室里很吵。"
    "孩子们挤在窗口往外看,有人踮脚,有人蹲下。"
    "外面在下雨。"
    "我站在门口,听着他们七嘴八舌地讨论明天的春游要不要改期。"
    "其实这事我也拿不准。"
    "天气预报说有雷阵雨,但谁知道呢?"
    "上次说下雨结果晴了一整天。"
    "我让他们先回座位,等会儿问问家长群。"
)

# 极端边界:空文本
SAMPLE_EMPTY: str = ""

# PPL 测试用:同一意思的 AI 风 vs 人类风
SAMPLE_AI_VARIANT: str = "研究表明,该方法显著提升了效率。"
SAMPLE_HUMAN_VARIANT: str = "效率这东西,我们试下来确实是涨了。"


# 所有样本的注册表(便于批量测试)
ALL_SAMPLES: dict[str, str] = {
    "short_clean": SAMPLE_SHORT_CLEAN,
    "with_dashes": SAMPLE_WITH_DASHES,
    "academic_ai": SAMPLE_ACADEMIC_AI,
    "marketing_ai": SAMPLE_MARKETING_AI,
    "human_like": SAMPLE_HUMAN_LIKE,
    "empty": SAMPLE_EMPTY,
    "ai_variant": SAMPLE_AI_VARIANT,
    "human_variant": SAMPLE_HUMAN_VARIANT,
}
