import { Router, Request, Response } from 'express';
import { WebhookService } from '../services/webhook-service';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { Pool } from 'pg';

export function createWebhooksRouter(db: Pool): Router {
  const router = Router();
  const webhookService = new WebhookService(db);

  // Internal route for SMTP service to trigger webhooks
  router.post('/internal/webhooks/trigger', async (req: Request, res: Response) => {
    try {
      const { userId, emailId, webhookUrl } = req.body;

      if (!userId || !emailId || !webhookUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      await webhookService.triggerWebhook(userId, emailId, webhookUrl);
      res.json({ message: 'Webhook triggered' });
    } catch (error) {
      console.error('Error triggering webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get webhook logs (authenticated)
  router.get('/logs', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string || '50', 10);
      const logs = await webhookService.getWebhookLogs(req.userId!, limit);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
