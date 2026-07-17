export { Paper } from './paper.entity'
export { PlagiarismResult } from './plagiarism-result.entity'
export { AiDetectionResult } from './ai-detection-result.entity'
export { HumanizeIteration } from './humanize-iteration.entity'
export { CorpusFingerprint } from './corpus-fingerprint.entity'

/**
 * 所有实体列表,供 TypeORM forRoot / DataSource 注册
 */
import { Paper } from './paper.entity'
import { PlagiarismResult } from './plagiarism-result.entity'
import { AiDetectionResult } from './ai-detection-result.entity'
import { HumanizeIteration } from './humanize-iteration.entity'
import { CorpusFingerprint } from './corpus-fingerprint.entity'

export const entities = [
  Paper,
  PlagiarismResult,
  AiDetectionResult,
  HumanizeIteration,
  CorpusFingerprint,
]
