/**
 * 降AI 规则引擎 · 规则数据
 *
 * 对应 plan/humanize-module.md §3:
 *   - 18 条 deterministic 规则(正则直接替换)
 *   - 7 条 flagged 规则(只标记位置,交给 LLM 语义处理)
 *
 * 规则引擎执行顺序(见 rule-engine.ts):
 *   1. 先跑 flagged 标记(不改动文本,记录位置 + hint)
 *   2. 再跑 deterministic 替换(改动文本)
 *   3. 最后扫破折号残留(应 = 0)
 *
 * flagged 先跑:它的正则匹配原始位置,deterministic 替换后位置会漂移。
 */

// ===== 类型定义 =====

export interface DeterministicRule {
  /** 规则 ID,如 'dash-zero' */
  id: string
  /** 匹配正则 */
  pattern: RegExp
  /**
   * 替换:字符串或函数
   * 函数签名对应 String.prototype.replace 的 replacer
   */
  replace: string | ((match: string, ...groups: string[]) => string)
  /** 人读的理由(返回给前端展示) */
  reason: string
  /** 对应 humanizer skill 模式编号(1-33),可选 */
  skillPattern?: number
}

export interface FlaggedRule {
  id: string
  /** 匹配正则(粗粒度,覆盖不了的形式交给 LLM 兜底) */
  pattern: RegExp
  /** 模式名,如 '三段式' */
  patternName: string
  /** 对应 humanizer skill 模式编号 */
  skillPattern: number
  /** 给 LLM 的提示,如 '此段含三段式结构,请打破对称' */
  hint: string
}

// ===== deterministic 规则(18 条) =====
// 按优先级排列。破折号零容忍是硬约束,放第一条。

export const DETERMINISTIC_RULES: DeterministicRule[] = [
  // 1. 破折号零容忍(硬约束)— 所有 — – —— -- 替换为句号/逗号
  {
    id: 'dash-zero',
    // 匹配各种破折号:em dash —, en dash –, 中文破折号 ——, 双连字符 --
    // 不匹配单词内的连字符(如 state-of-the-art)
    pattern: /[—–]|——|(\s)--(\s)|——/g,
    replace: (match: string, ...groups: string[]) => {
      // 如果前后是空格(-- 情况),替换为逗号;否则句号
      // 简单策略:统一替换为逗号,LLM 会进一步调整
      return ','
    },
    reason: '破折号替换为逗号(humanizer 硬约束:破折号是 AI 文本最强信号)',
    skillPattern: 1,
  },
  // 2. 弯引号 → 直引号
  {
    id: 'curly-quotes',
    pattern: /[""'']/g,
    replace: (match: string) => {
      if (match === '\u201C' || match === '\u201D') return '"'
      return "'" // ' 和 '
    },
    reason: '弯引号替换为直引号(AI 生成常见特征)',
    skillPattern: 2,
  },
  // 3. 表情符号剥离
  {
    id: 'emoji-strip',
    // Unicode emoji 范围(覆盖常见 emoji)
    pattern: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    replace: '',
    reason: '删除表情符号(学术文本不应出现)',
    skillPattern: 3,
  },
  // 4. Markdown 粗体 → 去标记
  {
    id: 'bold-markdown',
    pattern: /\*\*(.+?)\*\*/g,
    replace: '$1',
    reason: '去除 Markdown 粗体标记(散文化)',
    skillPattern: 4,
  },
  // 5. 内联标题列表 → 散文化标记(粗粒度,LLM 进一步重写)
  {
    id: 'inline-header-list',
    pattern: /-\s*\*\*(.+?):\*\*\s*(.+)/g,
    replace: '$1方面,$2。',
    reason: '内联标题列表改为散文化(LLM 会进一步调整)',
    skillPattern: 5,
  },
  // 6. 分号清理 → 逗号或句号
  {
    id: 'semicolon-clean',
    pattern: /[;；]/g,
    replace: '。',
    reason: '分号改为句号(打破 AI 常见的分号堆砌长句)',
  },
  // 7. AI 高频词:此外 → 另外
  {
    id: 'ai-vocab-furthermore',
    pattern: /此外[,,，]?/g,
    replace: '另外,',
    reason: '"此外"是 AI 高频连接词,替换为"另外"',
    skillPattern: 7,
  },
  // 8. AI 高频词:值得注意的是 → 删除
  {
    id: 'ai-vocab-noteworthy',
    pattern: /值得注意的是[,,，]?/g,
    replace: '',
    reason: '"值得注意的是"是 AI 腔,直接删除(让主句独立)',
    skillPattern: 7,
  },
  // 9. AI 高频词:综上所述 → 基于这些数据
  {
    id: 'ai-vocab-inconclusion',
    pattern: /综上所述[,,，]?/g,
    replace: '基于这些数据,',
    reason: '"综上所述"是 AI 模板词,替换为"基于这些数据"',
    skillPattern: 7,
  },
  // 10. AI 高频词:具有重要的...意义 → 挺关键的
  {
    id: 'ai-vocab-significance',
    pattern: /具有重要的.*?意义/g,
    replace: '挺关键的',
    reason: '"具有重要的...意义"是 AI 套话,替换为具体表述',
    skillPattern: 7,
  },
  // 11. AI 高频词:产生显著影响 → 影响很大
  {
    id: 'ai-vocab-significant-impact',
    pattern: /产生显著影响/g,
    replace: '影响很大',
    reason: '"产生显著影响"是 AI 宣传腔,替换为朴素表达',
    skillPattern: 7,
  },
  // 12. 填充短语:为了实现这一目标 → 为此
  {
    id: 'filler-achieve-goal',
    pattern: /为了实现这一目标[,,，]?/g,
    replace: '为此,',
    reason: '填充短语压缩(AI 倾向冗余表达)',
    skillPattern: 11,
  },
  // 13. 填充短语:在这个时间点 → 现在
  {
    id: 'filler-at-this-time',
    pattern: /在这个时间点/g,
    replace: '现在',
    reason: '填充短语压缩',
    skillPattern: 11,
  },
  // 14. 协作痕迹:希望这对您有帮助 → 删除
  {
    id: 'chatbot-artifact',
    pattern: /希望这对您有帮助[!!!]?[。。]?/g,
    replace: '',
    reason: '删除 chatbot 协作痕迹',
    skillPattern: 13,
  },
  // 15. 知识截止免责:截至.*训练数据 → 删除
  {
    id: 'cutoff-disclaimer',
    pattern: /截至.*?训练数据[。。]?/g,
    replace: '',
    reason: '删除知识截止免责声明',
    skillPattern: 14,
  },
  // 16. 谄媚语气:好问题!/您说得完全正确 → 删除
  {
    id: 'sycophantic',
    pattern: /(好问题[!!!]?[。。]?)|(您说得完全正确[。。]?)/g,
    replace: '',
    reason: '删除谄媚语气',
    skillPattern: 15,
  },
  // 17. 过度限定:可能潜在地/或许也许 → 可能
  {
    id: 'excessive-hedge',
    pattern: /(可能潜在地)|(或许也许)/g,
    replace: '可能',
    reason: '过度限定压缩为单一限定词',
    skillPattern: 18,
  },
  // 18. AI 腔词批量替换(格子达高危词)
  {
    id: 'ai-vocab-batch',
    pattern: /(赋能)|(助力)|(打造)|(护航)|(抓手)|(闭环)|(底层逻辑)|(全方位)|(多维度)|(全链路)/g,
    replace: (match: string) => {
      const map: Record<string, string> = {
        赋能: '支持',
        助力: '帮助',
        打造: '建立',
        护航: '保障',
        抓手: '手段',
        闭环: '完整流程',
        底层逻辑: '核心原理',
        全方位: '全面',
        多维度: '多角度',
        全链路: '全流程',
      }
      return map[match] ?? match
    },
    reason: 'AI 腔词替换为朴素表达(格子达高危词)',
    skillPattern: 7,
  },
]

// ===== flagged 规则(7 条,只标记不替换) =====

export const FLAGGED_RULES: FlaggedRule[] = [
  {
    id: 'F1',
    pattern: /首先[,,，]?[\s\S]{1,100}?。[\s\S]{0,20}?其次[,,，]?[\s\S]{1,100}?。[\s\S]{0,20}?最后/g,
    patternName: '三段式',
    skillPattern: 10,
    hint: '此段含"首先/其次/最后"三段式结构,请打破对称,用非顺序的方式组织',
  },
  {
    id: 'F2',
    pattern: /(不仅仅是?[^^。]{1,60}?而是)|(不是[^^。]{1,60}?而是)/g,
    patternName: '否定排比',
    skillPattern: 9,
    hint: '此段含否定排比("不是A而是B"),请改为直接陈述 B',
  },
  {
    id: 'F3',
    pattern: /作为[^^。]{1,40}?的(体现|证明|存在|表现|标志)/g,
    patternName: '系动词回避',
    skillPattern: 8,
    hint: '此段用"作为…的体现/证明"回避了"是",请用简单系动词或重写',
  },
  {
    id: 'F4',
    pattern: /从[^^。]{1,30}?到[^^。]{1,30}?[,，]?\s*从[^^。]{1,30}?到/g,
    patternName: '虚假范围',
    skillPattern: 12,
    hint: '此段含虚假范围排比("从A到B,从C到D"),请具体化',
  },
  {
    id: 'F5',
    pattern: /尽管[^^。]{1,60}?挑战[^^。]{0,40}?但仍[^^。]{1,40}?/g,
    patternName: '公式化挑战展望',
    skillPattern: 24,
    hint: '此段是公式化挑战展望("尽管…挑战…但仍…"),请改为具体问题陈述',
  },
  {
    id: 'F6',
    pattern: /(体现了|彰显了|展示了|反映了)[^^。]{0,10}?(的|了)/g,
    patternName: 'ing 肤浅分析',
    skillPattern: 21,
    hint: '此段含"-ing 式肤浅分析"尾缀("体现了/彰显了…"),请具体说明如何体现',
  },
  {
    id: 'F7',
    pattern: /(专家认为)|(有观察者指出)|(业内人士表示)|(学界普遍认为)/g,
    patternName: '模糊归因',
    skillPattern: 23,
    hint: '此段含模糊归因("专家认为"等),请补具体来源或删除',
  },
]
