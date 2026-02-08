import { Pool } from 'pg';
import { S3ClientWrapper } from './s3-service';

export interface Email {
  id: string;
  user_id: string;
  message_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_json: any;
  received_at: Date;
  attachment_count: number;
  attachments: any[];
}

export class EmailService {
  constructor(private db: Pool, private s3Client: S3ClientWrapper) {}

  async getEmailsByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ emails: Email[]; total: number }> {
    const emailsResult = await this.db.query(
      `SELECT * FROM emails WHERE user_id = $1 ORDER BY received_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const totalResult = await this.db.query(
      'SELECT COUNT(*) as count FROM emails WHERE user_id = $1',
      [userId]
    );

    return {
      emails: emailsResult.rows,
      total: parseInt(totalResult.rows[0].count, 10),
    };
  }

  async getEmailById(emailId: string, userId: string): Promise<Email | null> {
    const result = await this.db.query(
      'SELECT * FROM emails WHERE id = $1 AND user_id = $2',
      [emailId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getAttachmentUrl(emailId: string, attachmentIndex: number, userId: string): Promise<string | null> {
    const email = await this.getEmailById(emailId, userId);
    if (!email || !email.attachments || email.attachments.length <= attachmentIndex) {
      return null;
    }

    const attachment = email.attachments[attachmentIndex];
    if (attachment.s3Key) {
      return this.s3Client.getAttachmentUrl(attachment.s3Key);
    }

    if (attachment.data) {
      // For database-stored attachments, return data URL
      return `data:${attachment.contentType};base64,${attachment.data}`;
    }

    return null;
  }

  async getAttachmentData(emailId: string, attachmentIndex: number, userId: string): Promise<Buffer | null> {
    const email = await this.getEmailById(emailId, userId);
    if (!email || !email.attachments || email.attachments.length <= attachmentIndex) {
      return null;
    }

    const attachment = email.attachments[attachmentIndex];
    if (attachment.data) {
      return Buffer.from(attachment.data, 'base64');
    }

    // If stored in S3, would need to fetch it (not implemented for now)
    return null;
  }
}
