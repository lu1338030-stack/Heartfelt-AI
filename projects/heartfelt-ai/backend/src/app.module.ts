import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HealthModule } from './health/health.module'
import { AiServiceModule } from './ai-service/ai-service.module'
import { StorageModule } from './storage/storage.module'
import { PapersModule } from './papers/papers.module'
import { HumanizeModule } from './humanize/humanize.module'
import { entities } from './entities'

@Module({
  imports: [
    // 全局环境变量（根目录 ../.env）
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
    }),
    // TypeORM：PG 接通后启用
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: Number(config.get<string>('POSTGRES_PORT', '5432')),
        username: config.get<string>('POSTGRES_USER', 'heartfelt'),
        password: config.get<string>('POSTGRES_PASSWORD', 'heartfelt_dev'),
        database: config.get<string>('POSTGRES_DB', 'heartfelt'),
        entities,
        synchronize: false, // 永远 false，用 migration
        logging: config.get('NODE_ENV') !== 'production',
      }),
    }),
    StorageModule,
    HealthModule,
    AiServiceModule,
    PapersModule,
    HumanizeModule,
  ],
})
export class AppModule {}
