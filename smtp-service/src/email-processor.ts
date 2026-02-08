import { simpleParser, ParsedMail } from 'mailparser';
import { Pool } from 'pg';
import { S3ClientWrapper, AttachmentInfo } from './s3-client';
import axios from 'axios';

export interface EmailData {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyJson: ParsedMail;
  attachments: AttachmentInfo[];
}

export class EmailProcessor {
  private db: Pool;
  private s3Client: S3ClientWrapper;
  private httpApiUrl: string;

  constructor(db: Pool, s3Client: S3ClientWrapper, httpApiUrl: string) {
    this.db = db;
    this.s3Client = s3Client;
    this.httpApiUrl = httpApiUrl;
  }

  async processEmail(rawEmail: Buffer, userId: string): Promise<string> {
    try {
      // Parse email
      const parsed = await simpleParser(rawEmail);

      if (!parsed.messageId) {
        parsed.messageId = `<${Date.now()}-${Math.random().toString(36)}@open-inbound>`;
      }

      // Extract attachments
      const attachments: AttachmentInfo[] = [];
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const attachment of parsed.attachments) {
          if (attachment.content) {
            const buffer = Buffer.isBuffer(attachment.content)
              ? attachment.content
              : Buffer.from(attachment.content as any);

            const attachmentInfo = await this.s3Client.uploadAttachment(
              buffer,
              attachment.filename || 'attachment',
              attachment.contentType || 'application/octet-stream',
              userId,
              parsed.messageId
            );
            attachments.push(attachmentInfo);
          }
        }
      }

      // Store email in database
      const emailId = await this.storeEmail(userId, {
        messageId: parsed.messageId,
        from: parsed.from?.text || parsed.from?.value?.[0]?.address || 'unknown',
        to: parsed.to?.text || parsed.to?.value?.[0]?.address || 'unknown',
        subject: parsed.subject || '(no subject)',
        bodyJson: parsed as any,
        attachments,
      });

      // Trigger webhook if enabled
      await this.triggerWebhook(userId, emailId);

      return emailId;
    } catch (error) {
      console.error('Error processing email:', error);
      throw error;
    }
  }

  private async storeEmail(userId: string, emailData: EmailData): Promise<string> {
    const query = `
      INSERT INTO emails (user_id, message_id, from_address, to_address, subject, body_json, attachment_count, attachments)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const result = await this.db.query(query, [
      userId,
      emailData.messageId,
      emailData.from,
      emailData.to,
      emailData.subject,
      JSON.stringify(emailData.bodyJson),
      emailData.attachments.length,
      JSON.stringify(emailData.attachments),
    ]);

    return result.rows[0].id;
  }

  private async triggerWebhook(userId: string, emailId: string): Promise<void> {
    try {
      // Check if user has webhook enabled
      const userQuery = await this.db.query(
        'SELECT webhook_enabled, webhook_url FROM users WHERE id = $1',
        [userId]
      );

      if (userQuery.rows.length === 0 || !userQuery.rows[0].webhook_enabled) {
        return;
      }

      const webhookUrl = userQuery.rows[0].webhook_url;
      if (!webhookUrl) {
        return;
      }

      // Get email data
      const emailQuery = await this.db.query('SELECT * FROM emails WHERE id = $1', [emailId]);
      if (emailQuery.rows.length === 0) {
        return;
      }

      // Trigger webhook via HTTP API (which handles logging)
      await axios.post(`${this.httpApiUrl}/api/internal/webhooks/trigger`, {
        userId,
        emailId,
        webhookUrl,
      });
    } catch (error) {
      console.error('Error triggering webhook:', error);
      // Don't throw - webhook failures shouldn't fail email processing
    }
  }
}
