import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm'
import { PlagiarismResult } from './plagiarism-result.entity'
import { AiDetectionResult } from './ai-detection-result.entity'
import { HumanizeIteration } from './humanize-iteration.entity'

/**
 * 论文记录
 * 对应表 papers;文件实体存 MinIO,此表只存元数据 + object_key
 */
@Entity('papers')
export class Paper {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string

  @Column({ type: 'varchar', length: 255 })
  filename: string

  @Column({ name: 'char_count', type: 'int' })
  charCount: number

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'processing' | 'done' | 'failed'

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date

  @Column({ name: 'object_key', type: 'varchar', length: 255 })
  objectKey: string

  @OneToMany(() => PlagiarismResult, (r) => r.paper)
  plagiarismResults: PlagiarismResult[]

  @OneToMany(() => AiDetectionResult, (r) => r.paper)
  aiDetectionResults: AiDetectionResult[]

  @OneToMany(() => HumanizeIteration, (i) => i.paper)
  humanizeIterations: HumanizeIteration[]
}
