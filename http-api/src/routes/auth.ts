import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserService } from '../services/user-service';
import { Pool } from 'pg';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-secret';
const REGISTRATION_ENABLED = process.env.REGISTRATION_ENABLED === 'true' || process.env.REGISTRATION_ENABLED === undefined;
const DEFAULT_RETENTION_DAYS = parseInt(process.env.DEFAULT_RETENTION_DAYS || '30', 10);

export function createAuthRouter(db: Pool): Router {
  const userService = new UserService(db);

  // Public settings endpoint to check registration status
  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const result = await db.query(
        "SELECT value FROM settings WHERE key = 'registration_enabled'"
      );
      
      let registrationEnabled = true; // Default to enabled
      if (result.rows.length > 0) {
        const value = result.rows[0].value;
        // Handle both JSONB and string values
        registrationEnabled = typeof value === 'boolean' ? value : value === 'true' || value === true;
      } else {
        // Fallback to environment variable if not in database
        registrationEnabled = REGISTRATION_ENABLED;
      }

      res.json({ registration_enabled: registrationEnabled });
    } catch (error) {
      console.error('Error fetching registration settings:', error);
      // Fallback to environment variable on error
      res.json({ registration_enabled: REGISTRATION_ENABLED });
    }
  });

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await userService.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if user is banned
      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return res.status(403).json({ error: 'Account is banned' });
      }

      const isValid = await userService.verifyPassword(user, password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id, email: `${user.username}@${user.domain}` },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: `${user.username}@${user.domain}`,
          api_access_enabled: user.api_access_enabled,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/register', async (req: Request, res: Response) => {
    try {
      if (!REGISTRATION_ENABLED) {
        return res.status(403).json({ error: 'Registration is disabled' });
      }

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const [username, domain] = email.toLowerCase().split('@');
      if (!username || !domain) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if user already exists
      const existingUser = await userService.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const user = await userService.createUser(
        {
          username,
          domain,
          password,
        },
        DEFAULT_RETENTION_DAYS
      );

      const token = jwt.sign(
        { userId: user.id, email: `${user.username}@${user.domain}` },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: `${user.username}@${user.domain}`,
          api_access_enabled: user.api_access_enabled,
        },
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.code === '23505') {
        // Unique constraint violation
        return res.status(409).json({ error: 'User already exists' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
