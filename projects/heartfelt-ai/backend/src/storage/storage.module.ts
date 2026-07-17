import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

/**
 * 存储模块（MinIO 封装）
 * Global 导出：任何模块都能直接注入 StorageService
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
