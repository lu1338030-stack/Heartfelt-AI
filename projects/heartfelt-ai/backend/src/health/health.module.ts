import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { AiServiceClient } from '../ai-service/ai-service.client'

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class HealthModule {}
