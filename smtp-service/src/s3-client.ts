import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as Minio from 'minio';
import { Readable } from 'stream';

export interface S3Config {
  type: 'local' | 'remote' | 'database' | 'none';
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket: string;
  region?: string;
}

export interface AttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
  s3Key?: string;
  data?: string; // base64 for database storage
}

export class S3ClientWrapper {
  private config: S3Config;
  private s3Client?: S3Client;
  private minioClient?: Minio.Client;

  constructor(config: S3Config) {
    this.config = config;
    this.initialize();
  }

  private initialize() {
    if (this.config.type === 'remote' && this.config.endpoint) {
      this.s3Client = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region || 'us-east-1',
        credentials: {
          accessKeyId: this.config.accessKey || '',
          secretAccessKey: this.config.secretKey || '',
        },
        forcePathStyle: true,
      });
    } else if (this.config.type === 'local') {
      this.minioClient = new Minio.Client({
        endPoint: this.config.endpoint?.replace('http://', '').replace('https://', '').split(':')[0] || 'minio',
        port: parseInt(this.config.endpoint?.split(':')[2] || '9000'),
        useSSL: false,
        accessKey: this.config.accessKey || 'minioadmin',
        secretKey: this.config.secretKey || 'minioadmin',
      });
    }
  }

  async uploadAttachment(
    buffer: Buffer,
    filename: string,
    contentType: string,
    userId: string,
    emailId: string
  ): Promise<AttachmentInfo> {
    if (this.config.type === 'none') {
      return {
        filename,
        contentType,
        size: buffer.length,
      };
    }

    if (this.config.type === 'database') {
      return {
        filename,
        contentType,
        size: buffer.length,
        data: buffer.toString('base64'),
      };
    }

    const timestamp = Date.now();
    const s3Key = `attachments/${userId}/${emailId}/${timestamp}-${filename}`;

    try {
      if (this.config.type === 'local' && this.minioClient) {
        // Ensure bucket exists
        const bucketExists = await this.minioClient.bucketExists(this.config.bucket);
        if (!bucketExists) {
          await this.minioClient.makeBucket(this.config.bucket, this.config.region || 'us-east-1');
        }

        await this.minioClient.putObject(
          this.config.bucket,
          s3Key,
          Readable.from(buffer),
          buffer.length,
          {
            'Content-Type': contentType,
          }
        );
      } else if (this.config.type === 'remote' && this.s3Client) {
        const command = new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: contentType,
        });
        await this.s3Client.send(command);
      }

      return {
        filename,
        contentType,
        size: buffer.length,
        s3Key,
      };
    } catch (error) {
      console.error('Error uploading attachment to S3:', error);
      throw error;
    }
  }

  getAttachmentUrl(s3Key: string): string | null {
    if (this.config.type === 'none' || !s3Key) {
      return null;
    }

    if (this.config.type === 'local') {
      return `${this.config.endpoint}/${this.config.bucket}/${s3Key}`;
    }

    if (this.config.type === 'remote') {
      return `${this.config.endpoint}/${this.config.bucket}/${s3Key}`;
    }

    return null;
  }
}
