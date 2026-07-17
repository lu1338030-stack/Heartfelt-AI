import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { PapersService } from './papers.service'
import { PaperRecordDto, PaperUploadResponseDto } from './dto/paper.dto'

/**
 * Papers 控制器
 * 实际路径（走全局前缀 /api/v1）：
 *   POST /api/v1/papers/upload    上传 .docx
 *   GET  /api/v1/papers/:id       查询单篇
 *
 * 设计文档第 6 章 REST 契约对齐
 */
@Controller('papers')
export class PapersController {
  constructor(private readonly papers: PapersService) {}

  /**
   * 上传论文
   * multipart/form-data, field name: file
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB 上限
  }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PaperUploadResponseDto> {
    if (!file) {
      throw new BadRequestException('缺少上传文件（field name 应为 "file"）')
    }
    const { paperId, charCount } = await this.papers.upload(
      file.originalname,
      file.buffer,
    )
    return { paperId, charCount }
  }

  /**
   * 查询单篇论文
   */
  @Get(':id')
  async getOne(@Param('id') id: string): Promise<PaperRecordDto> {
    return this.papers.getOne(id)
  }
}
