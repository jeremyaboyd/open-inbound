import { Router, Response } from 'express';
import { UserService, CreateUserData, UpdateUserData } from '../services/user-service';
import { AuthRequest, authenticateToken, requireAdmin } from '../middleware/auth';
import { Pool } from 'pg';

export function createAdminRouter(db: Pool): Router {
  const router = Router();
  const userService = new UserService(db);

  router.use(authenticateToken);
  router.use(requireAdmin);

  // Get all users
  router.get('/users', async (req: AuthRequest, res: Response) => {
    try {
      const users = await userService.listUsers();
      res.json(
        users.map((user) => ({
          id: user.id,
          username: user.username,
          domain: user.domain,
          email: `${user.username}@${user.domain}`,
          api_access_enabled: user.api_access_enabled,
          webhook_enabled: user.webhook_enabled,
          webhook_url: user.webhook_url,
          retention_days: user.retention_days,
          attachments_enabled: user.attachments_enabled,
          banned_until: user.banned_until,
          created_at: user.created_at,
          updated_at: user.updated_at,
        }))
      );
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create user
  router.post('/users', async (req: AuthRequest, res: Response) => {
    try {
      const data: CreateUserData = req.body;

      if (!data.username || !data.domain || !data.password) {
        return res.status(400).json({ error: 'Username, domain, and password are required' });
      }

      const DEFAULT_RETENTION_DAYS = parseInt(process.env.DEFAULT_RETENTION_DAYS || '30', 10);

      const user = await userService.createUser(data, DEFAULT_RETENTION_DAYS);

      res.status(201).json({
        id: user.id,
        username: user.username,
        domain: user.domain,
        email: `${user.username}@${user.domain}`,
        api_access_enabled: user.api_access_enabled,
        webhook_enabled: user.webhook_enabled,
        webhook_url: user.webhook_url,
        retention_days: user.retention_days,
        attachments_enabled: user.attachments_enabled,
        created_at: user.created_at,
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'User already exists' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update user
  router.put('/users/:id', async (req: AuthRequest, res: Response) => {
    try {
      const data: UpdateUserData = req.body;
      const user = await userService.updateUser(req.params.id, data);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        id: user.id,
        username: user.username,
        domain: user.domain,
        email: `${user.username}@${user.domain}`,
        api_access_enabled: user.api_access_enabled,
        webhook_enabled: user.webhook_enabled,
        webhook_url: user.webhook_url,
        retention_days: user.retention_days,
        attachments_enabled: user.attachments_enabled,
        banned_until: user.banned_until,
        updated_at: user.updated_at,
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete user
  router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
    try {
      await userService.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
