const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://smtp:smtp@db:5432/smtp'
});

// Inbox functions
async function createInbox(address, passwordHash, apiKey) {
  const result = await pool.query(
    'INSERT INTO inboxes (address, password_hash, api_key) VALUES ($1, $2, $3) RETURNING *',
    [address, passwordHash, apiKey]
  );
  return result.rows[0];
}

async function findInboxByAddress(address) {
  const result = await pool.query(
    'SELECT * FROM inboxes WHERE address = $1',
    [address]
  );
  return result.rows[0] || null;
}

async function findInboxByApiKey(apiKey) {
  const result = await pool.query(
    'SELECT * FROM inboxes WHERE api_key = $1',
    [apiKey]
  );
  return result.rows[0] || null;
}

async function findInboxById(id) {
  const result = await pool.query(
    'SELECT * FROM inboxes WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function updateWebhookUrl(inboxId, url) {
  const result = await pool.query(
    'UPDATE inboxes SET webhook_url = $1 WHERE id = $2 RETURNING *',
    [url || null, inboxId]
  );
  return result.rows[0];
}

async function regenerateApiKey(inboxId, newKey) {
  const result = await pool.query(
    'UPDATE inboxes SET api_key = $1 WHERE id = $2 RETURNING *',
    [newKey, inboxId]
  );
  return result.rows[0];
}

async function listAllInboxes() {
  const result = await pool.query(
    `SELECT 
      i.id, 
      i.address, 
      i.disabled, 
      i.created_at,
      COUNT(e.id) as email_count
    FROM inboxes i
    LEFT JOIN emails e ON e.inbox_id = i.id
    GROUP BY i.id, i.address, i.disabled, i.created_at
    ORDER BY i.created_at DESC`
  );
  return result.rows;
}

async function disableInbox(inboxId) {
  const result = await pool.query(
    'UPDATE inboxes SET disabled = TRUE WHERE id = $1 RETURNING *',
    [inboxId]
  );
  return result.rows[0];
}

async function enableInbox(inboxId) {
  const result = await pool.query(
    'UPDATE inboxes SET disabled = FALSE WHERE id = $1 RETURNING *',
    [inboxId]
  );
  return result.rows[0];
}

async function deleteInbox(inboxId) {
  await pool.query('DELETE FROM inboxes WHERE id = $1', [inboxId]);
}

// Email functions
async function insertEmail(inboxId, from, to, subject, textBody, htmlBody, raw) {
  const result = await pool.query(
    `INSERT INTO emails (inbox_id, "from", "to", subject, text_body, html_body, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [inboxId, from, to, subject, textBody, htmlBody, raw]
  );
  return result.rows[0].id;
}

async function insertAttachment(emailId, filename, contentType, size, content) {
  const result = await pool.query(
    `INSERT INTO attachments (email_id, filename, content_type, size, content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [emailId, filename, contentType, size, content]
  );
  return result.rows[0].id;
}

const FILTERABLE_EMAIL_COLUMNS = new Set(['from', 'to', 'subject']);

async function listEmails(inboxId, limit = 50, offset = 0, filters = {}) {
  const conditions = ['inbox_id = $1'];
  const params = [inboxId];
  let idx = 2;

  for (const [col, value] of Object.entries(filters)) {
    if (!FILTERABLE_EMAIL_COLUMNS.has(col) || typeof value !== 'string') continue;
    conditions.push(`"${col}" ILIKE $${idx}`);
    params.push(value);
    idx++;
  }

  params.push(limit, offset);
  const result = await pool.query(
    `SELECT * FROM emails 
     WHERE ${conditions.join(' AND ')} 
     ORDER BY received_at DESC 
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return result.rows;
}

async function getEmail(emailId, inboxId) {
  const result = await pool.query(
    'SELECT * FROM emails WHERE id = $1 AND inbox_id = $2',
    [emailId, inboxId]
  );
  return result.rows[0] || null;
}

async function deleteEmail(emailId, inboxId) {
  await pool.query(
    'DELETE FROM emails WHERE id = $1 AND inbox_id = $2',
    [emailId, inboxId]
  );
}

async function listAttachments(emailId) {
  const result = await pool.query(
    'SELECT id, filename, content_type, size, created_at FROM attachments WHERE email_id = $1',
    [emailId]
  );
  return result.rows;
}

async function getAttachment(attachmentId, emailId) {
  const result = await pool.query(
    'SELECT * FROM attachments WHERE id = $1 AND email_id = $2',
    [attachmentId, emailId]
  );
  return result.rows[0] || null;
}

async function deleteOldEmails(retentionDays) {
  const result = await pool.query(
    `DELETE FROM emails 
     WHERE received_at < NOW() - INTERVAL '${retentionDays} days'
     RETURNING id`
  );
  return result.rowCount;
}

module.exports = {
  pool,
  createInbox,
  findInboxByAddress,
  findInboxByApiKey,
  findInboxById,
  updateWebhookUrl,
  regenerateApiKey,
  listAllInboxes,
  disableInbox,
  enableInbox,
  deleteInbox,
  insertEmail,
  insertAttachment,
  listEmails,
  getEmail,
  deleteEmail,
  listAttachments,
  getAttachment,
  deleteOldEmails
};
