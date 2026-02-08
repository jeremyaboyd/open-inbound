import { SMTPServer, SMTPServerOptions } from 'smtp-server';
import { Pool } from 'pg';
import { EmailProcessor } from './email-processor';
import { S3ClientWrapper } from './s3-client';

export class OpenInboundSMTPServer {
  private server: SMTPServer;
  private db: Pool;
  private emailProcessor: EmailProcessor;
  private s3Client: S3ClientWrapper;
  private httpApiUrl: string;

  constructor(
    db: Pool,
    s3Client: S3ClientWrapper,
    httpApiUrl: string,
    options: { host?: string; port?: number } = {}
  ) {
    this.db = db;
    this.s3Client = s3Client;
    this.httpApiUrl = httpApiUrl;
    this.emailProcessor = new EmailProcessor(db, s3Client, httpApiUrl);

    const serverOptions: SMTPServerOptions = {
      name: 'Open Inbound',
      authMethods: [],
      disabledCommands: ['AUTH'],
      onConnect: this.onConnect.bind(this),
      onMailFrom: this.onMailFrom.bind(this),
      onRcptTo: this.onRcptTo.bind(this),
      onData: this.onData.bind(this),
      logger: true,
    };

    this.server = new SMTPServer(serverOptions);
  }

  private async onConnect(session: any, callback: (err?: Error) => void) {
    // Accept all connections
    callback();
  }

  private async onMailFrom(address: any, session: any, callback: (err?: Error) => void) {
    // Accept all senders (receive-only service)
    callback();
  }

  private async onRcptTo(address: any, session: any, callback: (err?: Error) => void) {
    try {
      const emailAddress = address.address.toLowerCase();
      const [username, domain] = emailAddress.split('@');

      if (!username || !domain) {
        return callback(new Error('Invalid email address format'));
      }

      // Check if user exists in database
      const result = await this.db.query(
        'SELECT id, banned_until FROM users WHERE username = $1 AND domain = $2',
        [username, domain]
      );

      if (result.rows.length === 0) {
        return callback(new Error('Recipient not found'));
      }

      const user = result.rows[0];

      // Check if user is banned
      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return callback(new Error('Recipient is banned'));
      }

      // Store recipient info in session for later use
      session.userId = user.id;
      callback();
    } catch (error) {
      console.error('Error validating recipient:', error);
      callback(error as Error);
    }
  }

  private async onData(stream: any, session: any, callback: (err?: Error) => void) {
    if (!session.userId) {
      return callback(new Error('No valid recipient'));
    }

    try {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', async () => {
        try {
          const rawEmail = Buffer.concat(chunks);
          await this.emailProcessor.processEmail(rawEmail, session.userId);
          callback();
        } catch (error) {
          console.error('Error processing email data:', error);
          callback(error as Error);
        }
      });

      stream.on('error', (error: Error) => {
        callback(error);
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  listen(port: number, host: string = '0.0.0.0'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(`SMTP server listening on ${host}:${port}`);
          resolve();
        }
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}
