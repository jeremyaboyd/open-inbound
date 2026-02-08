import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as Minio from 'minio';

export interface S3Config {
  type: 'local' | 'remote' | 'database' | 'none';
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket: string;
  region?: string;
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

  async getAttachment(s3Key: string): Promise<Buffer | null> {
    if (this.config.type === 'none' || !s3Key) {
      return null;
    }

    try {
      if (this.config.type === 'local' && this.minioClient) {
        const chunks: Buffer[] = [];
        const stream = await this.minioClient.getObject(this.config.bucket, s3Key);
        
        return new Promise((resolve, reject) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', reject);
        });
      } else if (this.config.type === 'remote' && this.s3Client) {
        const command = new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: s3Key,
        });
        const response = await this.s3Client.send(command);
        const chunks: Buffer[] = [];
        
        if (response.Body) {
          for await (const chunk of response.Body as any) {
            chunks.push(Buffer.from(chunk));
          }
          return Buffer.concat(chunks);
        }
      }
    } catch (error) {
      console.error('Error fetching attachment from S3:', error);
      return null;
    }

    return null;
  }
}
