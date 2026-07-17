import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Paper } from './paper.entity'

/**
 * AI 检测结果
 * perplexity / burstiness / fingerprint_score 可空:Phase 2 Python 服务未就绪时为 null
 */
@Entity('ai_detection_results')
export class AiDetectionResult {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column({ name: 'paper_id', type: 'uuid' })
  paperId: string

  @ManyToOne(() => Paper, (p) => p.aiDetectionResults, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paper_id' })
  paper: Paper

  @Column({ name: 'ai_rate', type: 'real' })
  aiRate: number

  @Column({ name: 'risk_level', type: 'varchar', length: 10 })
  riskLevel: 'low' | 'medium' | 'high'

  @Column({ name: 'perplexity', type: 'real', nullable: true })
  perplexity: number | null

  @Column({ name: 'burstiness', type: 'real', nullable: true })
  burstiness: number | null

  @Column({ name: 'fingerprint_score', type: 'real', nullable: true })
  fingerprintScore: number | null

  @Column({ name: 'paragraph_marks', type: 'jsonb' })
  paragraphMarks: object

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
