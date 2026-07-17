import { IsString, MaxLength, MinLength } from 'class-validator'

/**
 * 上传响应 DTO
 * 对应设计文档第 6 章：POST /papers/upload → { paperId, charCount }
 */
export class PaperUploadResponseDto {
  @IsString()
  @MinLength(1)
  paperId: string

  charCount: number
}

/**
 * 单篇论文查询响应（GET /papers/:id）
 * 与 shared/types/index.ts 的 Paper 对齐
 */
export class PaperRecordDto {
  @IsString()
  id: string

  @IsString()
  userId: string

  @IsString()
  @MaxLength(255)
  filename: string

  charCount: number

  status: 'pending' | 'processing' | 'done' | 'failed'

  /** ISO timestamp */
  uploadedAt: string

  /** 内部字段不暴露到 API：objectKey 只在服务端使用 */
  objectKey?: string
}
