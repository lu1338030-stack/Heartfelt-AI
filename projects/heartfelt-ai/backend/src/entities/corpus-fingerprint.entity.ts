import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

/**
 * 文献指纹库(查重底库)
 * embedding 字段是 pgvector 的 vector(768) 类型
 * TypeORM 不原生支持 vector 类型,这里声明为 string,SQL 用 raw 维护
 * (migration 里手动 CREATE TABLE + 索引,不用 TypeORM sync)
 */
@Entity('corpus_fingerprints')
export class CorpusFingerprint {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column({ name: 'source_type', type: 'varchar', length: 20 })
  sourceType: 'academic' | 'web' | 'user_upload'

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl: string | null

  @Column({ name: 'source_title', type: 'text', nullable: true })
  sourceTitle: string | null

  @Index()
  @Column({ type: 'varchar', length: 16 })
  simhash: string

  @Column({ name: 'segment_text', type: 'text' })
  segmentText: string

  /**
   * 768 维向量。声明为 string(序列化的 number[])
   * 写入时用 TypeORM 的 raw SQL:vector_in('[...]')
   * 读取时显式 ::text cast 拿到字符串再解析
   */
  @Column({ type: 'text', nullable: true })
  embedding: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
