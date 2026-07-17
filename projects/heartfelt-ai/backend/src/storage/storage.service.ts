import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client, ClientOptions } from 'minio'

/**
 * MinIO / S3 存储客户端
 * 负责论文 .docx 文件的 put / get / delete
 *
 * Bucket 在 OnModuleInit 自动创建(若不存在)
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: Client
  private readonly bucket: string

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('MINIO_ENDPOINT', 'localhost')
    const port = Number(config.get<string>('MINIO_PORT', '9000'))
    this.bucket = config.get<string>('MINIO_BUCKET', 'heartfelt-papers')
    const opts: ClientOptions = {
      endPoint: endpoint,
      port,
      useSSL: config.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: config.get<string>('MINIO_ACCESS_KEY', 'heartfelt'),
      secretKey: config.get<string>('MINIO_SECRET_KEY', 'heartfelt_dev'),
    }
    this.client = new Client(opts)
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket)
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1')
        this.logger.log(`Bucket created: ${this.bucket}`)
      } else {
        this.logger.log(`Bucket ready: ${this.bucket}`)
      }
    } catch (e) {
      // MinIO 尚未起来时不阻塞 NestJS 启动；后续接口调用会自然报错
      this.logger.warn(`Bucket init failed: ${(e as Error).message}`)
    }
  }

  /**
   * 上传文件
   * @param objectKey 存储路径，如 papers/{paperId}/original.docx
   * @param buffer    文件内容
   * @param metadata  contentType 等
   */
  async put(
    objectKey: string,
    buffer: Buffer,
    metadata: { 'content-type'?: string; [k: string]: string } = {},
  ): Promise<void> {
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, metadata)
  }

  /**
   * 下载文件，返回 Buffer
   */
  async get(objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, objectKey)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  /**
   * 删除文件
   */
  async delete(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey)
  }

  /**
   * 生成 presigned URL（前端直传/直接下载用，Phase 4 报告下载会用）
   */
  async presignedGet(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, expirySeconds)
  }
}
