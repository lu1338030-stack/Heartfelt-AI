import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Init0001: 建全部业务表 + pgvector 扩展 + 索引
 *
 * 涵盖 5 张表(对应 src/entities/):
 *   papers, plagiarism_results, ai_detection_results,
 *   humanize_iterations, corpus_fingerprints
 *
 * 手写 SQL 而非 migration:generate,因为:
 *   1. pgvector 的 vector(768) 类型 TypeORM schema 不识别
 *   2. ivfflat 索引需要显式 SQL
 *   3. uuid-ossp / gen_random_uuid 需要 pgcrypto(pg13+ 内置)
 */
export class Init0001CreateSchema1730000000000 implements MigrationInterface {
  name = 'Init0001CreateSchema1730000000000'

  async up(qr: QueryRunner): Promise<void> {
    // 1. 启用 pgvector 扩展(对应设计文档 SQL 第 448 行)
    await qr.query(`CREATE EXTENSION IF NOT EXISTS vector`)

    // 2. papers 表
    await qr.query(`
      CREATE TABLE "papers" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"       VARCHAR(64) NOT NULL,
        "filename"      VARCHAR(255) NOT NULL,
        "char_count"    INT NOT NULL,
        "status"        VARCHAR(20) DEFAULT 'pending',
        "uploaded_at"   TIMESTAMPTZ DEFAULT NOW(),
        "object_key"    VARCHAR(255) NOT NULL
      )
    `)
    await qr.query(`CREATE INDEX "idx_papers_user_id" ON "papers" ("user_id")`)

    // 3. plagiarism_results 表
    await qr.query(`
      CREATE TABLE "plagiarism_results" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "paper_id"          UUID NOT NULL REFERENCES "papers"("id") ON DELETE CASCADE,
        "total_similarity"  REAL NOT NULL,
        "copy_rate"         REAL NOT NULL,
        "citation_rate"     REAL NOT NULL,
        "red_spans"         JSONB NOT NULL,
        "sources"           JSONB NOT NULL,
        "created_at"        TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await qr.query(
      `CREATE INDEX "idx_plagiarism_results_paper_id" ON "plagiarism_results" ("paper_id")`,
    )

    // 4. ai_detection_results 表
    await qr.query(`
      CREATE TABLE "ai_detection_results" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "paper_id"          UUID NOT NULL REFERENCES "papers"("id") ON DELETE CASCADE,
        "ai_rate"           REAL NOT NULL,
        "risk_level"        VARCHAR(10) NOT NULL,
        "perplexity"        REAL,
        "burstiness"        REAL,
        "fingerprint_score" REAL,
        "paragraph_marks"   JSONB NOT NULL,
        "created_at"        TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await qr.query(
      `CREATE INDEX "idx_ai_detection_results_paper_id" ON "ai_detection_results" ("paper_id")`,
    )

    // 5. humanize_iterations 表
    await qr.query(`
      CREATE TABLE "humanize_iterations" (
        "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "paper_id"        UUID NOT NULL REFERENCES "papers"("id") ON DELETE CASCADE,
        "iteration"       INT NOT NULL,
        "before_ai_rate"  REAL NOT NULL,
        "after_ai_rate"   REAL NOT NULL,
        "changed_spans"   JSONB NOT NULL,
        "created_at"      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await qr.query(
      `CREATE INDEX "idx_humanize_iterations_paper_id" ON "humanize_iterations" ("paper_id")`,
    )

    // 6. corpus_fingerprints 表(含 pgvector embedding 列)
    await qr.query(`
      CREATE TABLE "corpus_fingerprints" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "source_type"   VARCHAR(20) NOT NULL,
        "source_url"    TEXT,
        "source_title"  TEXT,
        "simhash"       VARCHAR(16) NOT NULL,
        "segment_text"  TEXT NOT NULL,
        "embedding"     vector(768),
        "created_at"    TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await qr.query(
      `CREATE INDEX "idx_corpus_simhash" ON "corpus_fingerprints" ("simhash")`,
    )
    await qr.query(
      `CREATE INDEX "idx_corpus_source_type" ON "corpus_fingerprints" ("source_type")`,
    )
    // ivfflat 近似最近邻索引(向量检索用,lists=100 是 pgvector 推荐默认)
    await qr.query(`
      CREATE INDEX "idx_corpus_embedding" ON "corpus_fingerprints"
        USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)
    `)
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "idx_corpus_embedding"`)
    await qr.query(`DROP INDEX IF EXISTS "idx_corpus_source_type"`)
    await qr.query(`DROP INDEX IF EXISTS "idx_corpus_simhash"`)
    await qr.query(`DROP TABLE IF EXISTS "corpus_fingerprints"`)

    await qr.query(`DROP INDEX IF EXISTS "idx_humanize_iterations_paper_id"`)
    await qr.query(`DROP TABLE IF EXISTS "humanize_iterations"`)

    await qr.query(`DROP INDEX IF EXISTS "idx_ai_detection_results_paper_id"`)
    await qr.query(`DROP TABLE IF EXISTS "ai_detection_results"`)

    await qr.query(`DROP INDEX IF EXISTS "idx_plagiarism_results_paper_id"`)
    await qr.query(`DROP TABLE IF EXISTS "plagiarism_results"`)

    await qr.query(`DROP INDEX IF EXISTS "idx_papers_user_id"`)
    await qr.query(`DROP TABLE IF EXISTS "papers"`)

    // 不 DROP vector 扩展:可能有其他 DB 依赖;手动 drop 更安全
  }
}
