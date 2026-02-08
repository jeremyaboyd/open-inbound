import express, { Express } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createAuthRouter } from './routes/auth';
import { createEmailsRouter } from './routes/emails';
import { createAdminRouter } from './routes/admin';
import { createWebhooksRouter } from './routes/webhooks';
import { S3ClientWrapper } from './services/s3-service';
import { startRetentionJob } from './services/retention-job';
import path from 'path';

const HTTP_HOST = process.env.HTTP_HOST || '0.0.0.0';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://openinbound:password@localhost:5432/openinbound';

// S3 Configuration
const S3_TYPE = (process.env.S3_TYPE || 'none') as 'local' | 'remote' | 'database' | 'none';
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'attachments';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

async function main() {
  console.log('Starting Open Inbound HTTP API...');

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

  // Initialize Express app
  const app: Express = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files (admin UI)
  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/emails', createEmailsRouter(db, s3Client));
  app.use('/api/admin', createAdminRouter(db));
  app.use('/api', createWebhooksRouter(db));

  // Health check
  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', service: 'open-inbound-http-api' });
    } catch (error) {
      res.status(500).json({ status: 'error', service: 'open-inbound-http-api' });
    }
  });

  // Start retention job
  startRetentionJob(db);

  // Start server
  app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`HTTP API server started on ${HTTP_HOST}:${HTTP_PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await db.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await db.end();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
