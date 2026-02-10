const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const {
  createInbox,
  findInboxByAddress,
  findInboxById,
  updateWebhookUrl,
  regenerateApiKey,
  listEmails,
  getEmail,
  deleteEmail,
  listAttachments,
  getAttachment
} = require('../db');
const { createRateLimiter } = require('../rateLimit');

const router = express.Router();

// Rate limiters
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many accounts created. Please try again later.' });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please try again later.' });

// Address validation: alphanumeric, dots, hyphens, underscores; 1-64 chars
const ADDRESS_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const MIN_PASSWORD_LENGTH = 8;

// Registration can be disabled via env (default: enabled)
const REGISTRATION_ENABLED = process.env.REGISTRATION_ENABLED !== 'false';

// Auth middleware for inbox routes
async function requireInboxAuth(req, res, next) {
  if (!req.session.inboxId) {
    return res.redirect('/login');
  }

  const inbox = await findInboxById(req.session.inboxId);
  if (!inbox) {
    req.session.destroy();
    return res.redirect('/login?error=inbox_not_found');
  }

  if (inbox.disabled) {
    req.session.destroy();
    return res.redirect('/login?error=inbox_disabled');
  }

  req.inbox = inbox;
  next();
}

// Home page - developer-facing landing with login and optional register
router.get('/', (req, res) => {
  res.render('home', {
    registrationEnabled: REGISTRATION_ENABLED,
    error: req.query.error,
    domain: process.env.DOMAIN || 'localhost'
  });
});

router.post('/', registerLimiter, async (req, res) => {
  if (!REGISTRATION_ENABLED) {
    return res.status(404).send('Not Found');
  }

  const { address, password } = req.body;

  if (!address || !password) {
    return res.render('home', { registrationEnabled: true, error: 'Address and password are required' });
  }

  // Validate address format
  if (!ADDRESS_RE.test(address)) {
    return res.render('home', { registrationEnabled: true, error: 'Address must start with a letter or number and contain only letters, numbers, dots, hyphens, or underscores (max 64 characters).' });
  }

  // Validate password strength
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.render('home', { registrationEnabled: true, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  // Check if inbox already exists
  const existing = await findInboxByAddress(address);
  if (existing) {
    return res.render('home', { registrationEnabled: true, error: 'Inbox already exists' });
  }

  // Create inbox
  const passwordHash = await bcrypt.hash(password, 10);
  const apiKey = uuidv4();

  try {
    await createInbox(address, passwordHash, apiKey);
    res.redirect('/login?created=1');
  } catch (error) {
    console.error('Error creating inbox:', error);
    res.render('home', { registrationEnabled: true, error: 'Failed to create inbox' });
  }
});

// Login
router.get('/login', (req, res) => {
  const { error, created } = req.query;
  res.render('login', { error, created });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { address, password } = req.body;

  if (!address || !password) {
    return res.render('login', { error: 'Address and password are required' });
  }

  const inbox = await findInboxByAddress(address);
  if (!inbox) {
    return res.render('login', { error: 'Invalid address or password' });
  }

  if (inbox.disabled) {
    return res.render('login', { error: 'This inbox is disabled' });
  }

  const valid = await bcrypt.compare(password, inbox.password_hash);
  if (!valid) {
    return res.render('login', { error: 'Invalid address or password' });
  }

  req.session.inboxId = inbox.id;
  res.redirect('/inbox');
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Inbox list
router.get('/inbox', requireInboxAuth, async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);

  const emails = await listEmails(req.inbox.id, limit, offset);
  res.render('inbox', { emails, inbox: req.inbox, limit, offset, domain: process.env.DOMAIN || 'localhost' });
});

// Email detail
router.get('/inbox/emails/:id', requireInboxAuth, async (req, res) => {
  const email = await getEmail(req.params.id, req.inbox.id);
  if (!email) {
    return res.status(404).send('Email not found');
  }

  const attachments = await listAttachments(email.id);
  res.render('email', { email, attachments, inbox: req.inbox });
});

// Delete email
router.post('/inbox/emails/:id', requireInboxAuth, async (req, res) => {
  await deleteEmail(req.params.id, req.inbox.id);
  res.redirect('/inbox');
});

// Download attachment
router.get('/inbox/emails/:id/attachments/:attachmentId', requireInboxAuth, async (req, res) => {
  const attachment = await getAttachment(req.params.attachmentId, req.params.id);
  if (!attachment) {
    return res.status(404).send('Attachment not found');
  }

  // Sanitise filename for Content-Disposition header
  const safeFilename = (attachment.filename || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', attachment.content_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(attachment.content);
});

// API Docs
router.get('/inbox/api-docs', requireInboxAuth, (req, res) => {
  res.render('api-docs', { inbox: req.inbox, domain: process.env.DOMAIN || 'localhost' });
});

// Settings
router.get('/inbox/settings', requireInboxAuth, (req, res) => {
  res.render('settings', { inbox: req.inbox });
});

router.post('/inbox/settings', requireInboxAuth, async (req, res) => {
  const { webhook_url, regenerate_api_key } = req.body;

  if (webhook_url !== undefined) {
    await updateWebhookUrl(req.inbox.id, webhook_url);
  }

  if (regenerate_api_key) {
    const newApiKey = uuidv4();
    await regenerateApiKey(req.inbox.id, newApiKey);
    req.inbox.api_key = newApiKey;
  }

  res.redirect('/inbox/settings?updated=1');
});

module.exports = router;
