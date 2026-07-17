/**
 * 检测中心 mock 数据。
 * 所有数值都是假数据，用于填充 UI。后续接后端时替换为真实接口。
 */

/** 检测类型 tab */
export type DetectionType = 'text' | 'image' | 'multimodal'

/** 单条检测历史记录 */
export interface HistoryItem {
  id: string
  title: string
  type: '文本' | '图像' | '多模态'
  timestamp: string
  model: string
  aiProbability: number
  /** AI 概率的高低决定颜色：高=error红，低=tertiary绿 */
  severity: 'high' | 'low'
  icon: string
}

/** mock 检测历史（对应原型 code.html 行 377-426 的两条记录） */
export const MOCK_HISTORY: HistoryItem[] = [
  {
    id: '1',
    title: '关于人工智能发展的深度分析报告...',
    type: '文本',
    timestamp: '2024-01-15 14:32',
    model: 'SpeedAI-v3.2',
    aiProbability: 94.2,
    severity: 'high',
    icon: 'article',
  },
  {
    id: '2',
    title: '个人旅行日记：云南大理三日游...',
    type: '文本',
    timestamp: '2024-01-15 11:08',
    model: 'SpeedAI-v3.2',
    aiProbability: 12.5,
    severity: 'low',
    icon: 'person',
  },
]

/** mock 检测结果（点击"一键检测"后填充） */
export const MOCK_DETECTION_RESULT = {
  aiProbability: 87.3,
  humanProbability: 8.2,
  mixedProbability: 4.5,
  confidence: 96.8,
  // 特征维度（4个）
  features: {
    lexicalDiversity: 0.42,
    syntacticStructure: 0.78,
    semanticCoherence: 0.91,
    styleConsistency: 0.65,
  },
}
