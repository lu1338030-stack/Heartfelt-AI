import {
  Body,
  Controller,
  HttpCode,
  Post,
  BadRequestException,
} from '@nestjs/common'
import { HumanizeService } from './humanize.service'
import { HumanizeRequestDto, HumanizeResponseDto } from './dto/humanize.dto'

/**
 * 降AI 控制器
 * 实际路径(走全局前缀 /api/v1):
 *   POST /api/v1/humanize   降AI 改写
 *
 * 对应 plan/humanize-module.md §5
 */
@Controller('humanize')
export class HumanizeController {
  constructor(private readonly humanize: HumanizeService) {}

  /**
   * 降AI 改写
   *
   * 请求体二选一:
   *   { "text": "..." }          直接传文本(50-50000 字)
   *   { "paperId": "uuid" }      传已上传论文 ID(从 DB + MinIO 取原文)
   *
   * 可选参数:
   *   { "scenario": "academic" }  场景,默认 academic
   *   { "maxRetries": 2 }         自检重试轮数,默认 2
   */
  @Post()
  @HttpCode(200)
  async run(
    @Body() dto: HumanizeRequestDto,
  ): Promise<HumanizeResponseDto> {
    if (!dto.text && !dto.paperId) {
      throw new BadRequestException('text 和 paperId 至少提供一个')
    }
    return this.humanize.humanize(dto)
  }
}
