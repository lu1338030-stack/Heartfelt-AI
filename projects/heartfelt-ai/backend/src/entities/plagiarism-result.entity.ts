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
 * 查重结果
 * red_spans / sources 用 JSONB 存,避免再拆表(查询场景简单)
 */
@Entity('plagiarism_results')
export class PlagiarismResult {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column({ name: 'paper_id', type: 'uuid' })
  paperId: string

  @ManyToOne(() => Paper, (p) => p.plagiarismResults, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paper_id' })
  paper: Paper

  @Column({ name: 'total_similarity', type: 'real' })
  totalSimilarity: number

  @Column({ name: 'copy_rate', type: 'real' })
  copyRate: number

  @Column({ name: 'citation_rate', type: 'real' })
  citationRate: number

  @Column({ name: 'red_spans', type: 'jsonb' })
  redSpans: object

  @Column({ name: 'sources', type: 'jsonb' })
  sources: object

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
