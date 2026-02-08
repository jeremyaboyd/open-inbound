import { Pool } from 'pg';
import { OpenInboundSMTPServer } from './smtp-server';
import { S3ClientWrapper } from './s3-client';

const SMTP_HOST = process.env.SMTP_HOST || '0.0.0.0';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '25', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://openinbound:password@localhost:5432/openinbound';
const HTTP_API_URL = process.env.HTTP_API_URL || 'http://localhost:3000';

// S3 Configuration
const S3_TYPE = (process.env.S3_TYPE || 'none') as 'local' | 'remote' | 'database' | 'none';
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'attachments';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

async function main() {
  console.log('Starting Open Inbound SMTP Service...');

  // Initialize database connection
  const db = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test database connection
  try {
    await db.query('SELECT NOW()');
    console.log('Database connection established');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }

  // Initialize S3 client
  const s3Client = new S3ClientWrapper({
    type: S3_TYPE,
    endpoint: S3_ENDPOINT,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    bucket: S3_BUCKET,
    region: S3_REGION,
  });

  // Initialize SMTP server
  const smtpServer = new OpenInboundSMTPServer(db, s3Client, HTTP_API_URL);

  // Start server
  try {
    await smtpServer.listen(SMTP_PORT, SMTP_HOST);
    console.log(`SMTP server started on ${SMTP_HOST}:${SMTP_PORT}`);
  } catch (error) {
    console.error('Failed to start SMTP server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await smtpServer.close();
    await db.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await smtpServer.close();
    await db.end();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
