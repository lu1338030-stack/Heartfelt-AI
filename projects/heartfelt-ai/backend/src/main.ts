import { ValidationPipe, Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  // 全局前缀
  app.setGlobalPrefix('api/v1')

  // CORS（前端 :5173）
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  })

  // 全局 DTO 校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  )

  const port = Number(process.env.BACKEND_PORT) || 3000
  await app.listen(port)

  Logger.log(`Backend running at http://localhost:${port}`, 'Bootstrap')
  Logger.log(`Health: http://localhost:${port}/api/v1/health`, 'Bootstrap')
  Logger.log(`Readiness: http://localhost:${port}/api/v1/health/ready`, 'Bootstrap')
}

bootstrap()
