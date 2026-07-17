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
 * 降AI 迭代日志
 * 每轮改写的 before/after AI率 + 改动片段,Phase 4 主流程串联时记录
 */
@Entity('humanize_iterations')
export class HumanizeIteration {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column({ name: 'paper_id', type: 'uuid' })
  paperId: string

  @ManyToOne(() => Paper, (p) => p.humanizeIterations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paper_id' })
  paper: Paper

  @Column({ type: 'int' })
  iteration: number

  @Column({ name: 'before_ai_rate', type: 'real' })
  beforeAiRate: number

  @Column({ name: 'after_ai_rate', type: 'real' })
  afterAiRate: number

  @Column({ name: 'changed_spans', type: 'jsonb' })
  changedSpans: object

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
