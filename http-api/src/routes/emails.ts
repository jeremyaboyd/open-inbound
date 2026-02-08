import { Router, Response } from 'express';
import { EmailService } from '../services/email-service';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { Pool } from 'pg';
import { S3ClientWrapper } from '../services/s3-service';

export function createEmailsRouter(db: Pool, s3Client: S3ClientWrapper): Router {
  const router = Router();
  const emailService = new EmailService(db, s3Client);

  router.use(authenticateToken);

  router.get('/', async (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string || '50', 10);
      const offset = parseInt(req.query.offset as string || '0', 10);

      const result = await emailService.getEmailsByUserId(req.userId!, limit, offset);

      res.json({
        emails: result.emails.map((email) => ({
          id: email.id,
          messageId: email.message_id,
          from: email.from_address,
          to: email.to_address,
          subject: email.subject,
          receivedAt: email.received_at,
          attachmentCount: email.attachment_count,
        })),
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Error fetching emails:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
      const email = await emailService.getEmailById(req.params.id, req.userId!);

      if (!email) {
        return res.status(404).json({ error: 'Email not found' });
      }

      res.json({
        id: email.id,
        messageId: email.message_id,
        from: email.from_address,
        to: email.to_address,
        subject: email.subject,
        body: email.body_json,
        receivedAt: email.received_at,
        attachmentCount: email.attachment_count,
        attachments: email.attachments,
      });
    } catch (error) {
      console.error('Error fetching email:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id/attachments/:attachmentId', async (req: AuthRequest, res: Response) => {
    try {
      const attachmentIndex = parseInt(req.params.attachmentId, 10);
      const attachmentData = await emailService.getAttachmentData(
        req.params.id,
        attachmentIndex,
        req.userId!
      );

      if (!attachmentData) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      const email = await emailService.getEmailById(req.params.id, req.userId!);
      if (!email || !email.attachments || email.attachments.length <= attachmentIndex) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      const attachment = email.attachments[attachmentIndex];
      res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
      res.send(attachmentData);
    } catch (error) {
      console.error('Error fetching attachment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
