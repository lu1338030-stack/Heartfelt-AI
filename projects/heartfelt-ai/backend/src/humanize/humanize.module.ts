import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Paper } from '../entities/paper.entity'
import { HumanizeController } from './humanize.controller'
import { HumanizeService } from './humanize.service'

/**
 * 降AI 模块
 *
 * 依赖:
 *   - TypeOrmModule(Paper 实体,paperId 模式查原文)
 *   - StorageModule(全局,paperId 模式取 .docx,已在 app.module 注册)
 *
 * 见 plan/humanize-module.md §2.4 目录结构
 */
@Module({
  imports: [TypeOrmModule.forFeature([Paper])],
  controllers: [HumanizeController],
  providers: [HumanizeService],
  exports: [HumanizeService],
})
export class HumanizeModule {}
