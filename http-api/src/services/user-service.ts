import { Pool } from 'pg';
import bcrypt from 'bcrypt';

export interface User {
  id: string;
  username: string;
  domain: string;
  password_hash: string;
  api_access_enabled: boolean;
  webhook_enabled: boolean;
  webhook_url?: string;
  retention_days: number;
  attachments_enabled: boolean;
  banned_until?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  username: string;
  domain: string;
  password: string;
  api_access_enabled?: boolean;
  webhook_enabled?: boolean;
  webhook_url?: string;
  retention_days?: number;
  attachments_enabled?: boolean;
}

export interface UpdateUserData {
  username?: string;
  domain?: string;
  password?: string;
  api_access_enabled?: boolean;
  webhook_enabled?: boolean;
  webhook_url?: string;
  retention_days?: number;
  attachments_enabled?: boolean;
  banned_until?: Date;
}

export class UserService {
  constructor(private db: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const [username, domain] = email.toLowerCase().split('@');
    if (!username || !domain) {
      return null;
    }

    const result = await this.db.query(
      'SELECT * FROM users WHERE username = $1 AND domain = $2',
      [username, domain]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }

  async createUser(data: CreateUserData, defaultRetentionDays: number): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, 10);

    const result = await this.db.query(
      `INSERT INTO users (
        username, domain, password_hash, api_access_enabled, webhook_enabled,
        webhook_url, retention_days, attachments_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        data.username.toLowerCase(),
        data.domain.toLowerCase(),
        passwordHash,
        data.api_access_enabled ?? true,
        data.webhook_enabled ?? false,
        data.webhook_url || null,
        data.retention_days ?? defaultRetentionDays,
        data.attachments_enabled ?? true,
      ]
    );

    return result.rows[0];
  }

  async updateUser(id: string, data: UpdateUserData): Promise<User> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.username !== undefined) {
      updates.push(`username = $${paramCount++}`);
      values.push(data.username.toLowerCase());
    }
    if (data.domain !== undefined) {
      updates.push(`domain = $${paramCount++}`);
      values.push(data.domain.toLowerCase());
    }
    if (data.password !== undefined) {
      updates.push(`password_hash = $${paramCount++}`);
      values.push(await bcrypt.hash(data.password, 10));
    }
    if (data.api_access_enabled !== undefined) {
      updates.push(`api_access_enabled = $${paramCount++}`);
      values.push(data.api_access_enabled);
    }
    if (data.webhook_enabled !== undefined) {
      updates.push(`webhook_enabled = $${paramCount++}`);
      values.push(data.webhook_enabled);
    }
    if (data.webhook_url !== undefined) {
      updates.push(`webhook_url = $${paramCount++}`);
      values.push(data.webhook_url || null);
    }
    if (data.retention_days !== undefined) {
      updates.push(`retention_days = $${paramCount++}`);
      values.push(data.retention_days);
    }
    if (data.attachments_enabled !== undefined) {
      updates.push(`attachments_enabled = $${paramCount++}`);
      values.push(data.attachments_enabled);
    }
    if (data.banned_until !== undefined) {
      updates.push(`banned_until = $${paramCount++}`);
      values.push(data.banned_until || null);
    }

    if (updates.length === 0) {
      return this.findById(id) as Promise<User>;
    }

    values.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await this.db.query(query, values);

    return result.rows[0];
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async listUsers(): Promise<User[]> {
    const result = await this.db.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
  }
}
