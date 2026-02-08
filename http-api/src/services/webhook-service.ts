import { Pool } from 'pg';
import axios from 'axios';

export class WebhookService {
  constructor(private db: Pool) {}

  async triggerWebhook(userId: string, emailId: string, webhookUrl: string): Promise<void> {
    try {
      // Get email data
      const emailResult = await this.db.query('SELECT * FROM emails WHERE id = $1', [emailId]);
      if (emailResult.rows.length === 0) {
        throw new Error('Email not found');
      }

      const email = emailResult.rows[0];

      // Prepare webhook payload
      const payload = {
        id: email.id,
        messageId: email.message_id,
        from: email.from_address,
        to: email.to_address,
        subject: email.subject,
        body: email.body_json,
        receivedAt: email.received_at,
        attachmentCount: email.attachment_count,
        attachments: email.attachments,
      };

      // Send webhook
      const response = await axios.post(webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Log webhook attempt
      await this.logWebhook(userId, emailId, webhookUrl, response.status, response.data);
    } catch (error: any) {
      const statusCode = error.response?.status || 0;
      const responseBody = error.response?.data || error.message;

      // Log failed webhook attempt
      await this.logWebhook(userId, emailId, webhookUrl, statusCode, responseBody);

      // Don't throw - webhook failures shouldn't break the flow
      console.error('Webhook failed:', error.message);
    }
  }

  private async logWebhook(
    userId: string,
    emailId: string,
    webhookUrl: string,
    statusCode: number,
    responseBody: any
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO webhook_logs (user_id, email_id, webhook_url, status_code, response_body)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, emailId, webhookUrl, statusCode, JSON.stringify(responseBody)]
    );
  }

  async getWebhookLogs(userId: string, limit: number = 50): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM webhook_logs WHERE user_id = $1 ORDER BY attempted_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }
}
