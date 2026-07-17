import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Paper } from '../entities/paper.entity'
import { StorageService } from '../storage/storage.service'
import { PaperRecordDto } from './dto/paper.dto'

/**
 * Papers 业务服务
 * 职责：上传 .docx → 抽文本算字数 → 存 MinIO → 建 papers 记录
 *
 * 注意：本 Phase 只做"上传 + 查询"，
 * check 流程（查重/AI 检测/降AI）在 Phase 4 用 BullMQ 串。
 */
@Injectable()
export class PapersService {
  private readonly logger = new Logger(PapersService.name)

  constructor(
    @InjectRepository(Paper) private readonly papers: Repository<Paper>,
    private readonly storage: StorageService,
  ) {}

  /**
   * 上传论文
   * @param filename   原始文件名（含扩展名）
   * @param buffer     .docx 内容
   * @param userId     用户标识（v1 用占位值 "anonymous"，后续接鉴权）
   */
  async upload(
    filename: string,
    buffer: Buffer,
    userId = 'anonymous',
  ): Promise<{ paperId: string; charCount: number }> {
    // 1. 文件类型校验
    if (!filename.toLowerCase().endsWith('.docx')) {
      throw new BadRequestException('只支持 .docx 格式论文')
    }
    if (buffer.length === 0) {
      throw new BadRequestException('文件为空')
    }

    // 2. 抽文本算字数（mammoth 解析 OOXML）
    const charCount = await this.extractCharCount(buffer)

    // 3. 先建 papers 记录拿 id（id 也用作 MinIO objectKey 的一部分，保证唯一）
    const paper = this.papers.create({
      userId,
      filename,
      charCount,
      status: 'pending',
      objectKey: '', // 占位，下一步填
    })
    const saved = await this.papers.save(paper)
    const objectKey = `papers/${saved.id}/original.docx`
    saved.objectKey = objectKey
    await this.papers.save(saved)

    // 4. 存 MinIO
    try {
      await this.storage.put(objectKey, buffer, { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    } catch (e) {
      // 存储失败回滚 DB 记录
      await this.papers.delete(saved.id)
      throw new Error(`MinIO 上传失败: ${(e as Error).message}`)
    }

    this.logger.log(`Paper uploaded: id=${saved.id} filename=${filename} chars=${charCount}`)
    return { paperId: saved.id, charCount }
  }

  /**
   * 查询单篇
   */
  async getOne(id: string): Promise<PaperRecordDto> {
    const paper = await this.papers.findOneBy({ id })
    if (!paper) {
      throw new NotFoundException(`论文 '${id}' 不存在`)
    }
    return this.toDto(paper)
  }

  /**
   * mammoth 抽文本 → 字符数（去空白后）
   * 失败不抛，回退用文件大小估（保证上传主流程不被 docx 损坏阻塞）
   */
  private async extractCharCount(buffer: Buffer): Promise<number> {
    try {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ buffer })
      // 去掉所有空白（空格/制表/换行）后统计字符数
      const stripped = value.replace(/\s+/g, '')
      return stripped.length
    } catch (e) {
      this.logger.warn(
        `docx 解析失败，按字节估算字数: ${(e as Error).message}`,
      )
      return Math.floor(buffer.length / 3) // 中文 UTF-8 约 3 字节/字
    }
  }

  private toDto(p: Paper): PaperRecordDto {
    return {
      id: p.id,
      userId: p.userId,
      filename: p.filename,
      charCount: p.charCount,
      status: p.status,
      uploadedAt: p.uploadedAt.toISOString(),
    }
  }
}
