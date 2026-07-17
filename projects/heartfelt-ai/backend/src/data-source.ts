import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { config } from 'dotenv'
import { entities } from './entities'

/**
 * TypeORM DataSource(独立于 NestJS,供 CLI 用)
 *
 * 用法:
 *   pnpm migration:generate -- src/migrations/<Name>
 *   pnpm migration:run
 *   pnpm migration:revert
 *
 * 注意:CLI 通过 ts-node 运行(见 package.json scripts),
 * 所以这里必须显式加载 .env(NestJS 的 ConfigModule 此时不在)
 */
config({ path: [__dirname + '/../.env', __dirname + '/../../.env'] })

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  username: process.env.POSTGRES_USER || 'heartfelt',
  password: process.env.POSTGRES_PASSWORD || 'heartfelt_dev',
  database: process.env.POSTGRES_DB || 'heartfelt',
  entities,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false, // 永远 false;用 migration 管理 schema
  logging: process.env.NODE_ENV !== 'production',
})
