const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const {
  listAllInboxes,
  findInboxById,
  findInboxByAddress,
  createInbox,
  disableInbox,
  enableInbox,
  deleteInbox
} = require('../db');
const { createRateLimiter } = require('../rateLimit');

const ADDRESS_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const MIN_PASSWORD_LENGTH = 8;

const router = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Rate limiter for admin login
const adminLoginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts. Please try again later.' });

// Admin auth middleware
function requireAdminAuth(req, res, next) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(404).send('Not Found');
  }

  if (!req.session.isAdmin) {
    return res.redirect('/admin/login');
  }

  next();
}

// Timing-safe comparison using hashing to normalise lengths
// (avoids leaking the length of the expected value via early return)
function timingSafeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Admin API auth: Authorization: Basic base64(username:password)
function requireAdminApiAuth(req, res, next) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(404).json({ error: 'Not Found' });
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let decoded;
  try {
    decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const username = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  if (!timingSafeEqual(username, ADMIN_USERNAME) || !timingSafeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Admin login
router.get('/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(404).send('Not Found');
  }
  res.render('admin/login');
});

router.post('/login', adminLoginLimiter, (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(404).send('Not Found');
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('admin/login', { error: 'Username and password are required' });
  }

  // Timing-safe comparison
  const usernameMatch = timingSafeEqual(username, ADMIN_USERNAME);
  const passwordMatch = timingSafeEqual(password, ADMIN_PASSWORD);

  if (!usernameMatch || !passwordMatch) {
    return res.render('admin/login', { error: 'Invalid credentials' });
  }

  req.session.isAdmin = true;
  res.redirect('/admin');
});

// Admin logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin dashboard
router.get('/', requireAdminAuth, async (req, res) => {
  const inboxes = await listAllInboxes();
  const createdInboxApiKey = req.session.createdInboxApiKey;
  const createdInboxAddress = req.session.createdInboxAddress;
  if (req.session.createdInboxApiKey !== undefined) {
    delete req.session.createdInboxApiKey;
    delete req.session.createdInboxAddress;
  }
  const adminApiKey = (ADMIN_USERNAME && ADMIN_PASSWORD)
    ? Buffer.from(ADMIN_USERNAME + ':' + ADMIN_PASSWORD).toString('base64')
    : null;
  res.render('admin/dashboard', {
    inboxes,
    createdInboxApiKey: createdInboxApiKey || null,
    createdInboxAddress: createdInboxAddress || null,
    error: req.query.error || null,
    adminApiKey
  });
});

// Create inbox (dashboard form)
router.post('/inboxes', requireAdminAuth, async (req, res) => {
  const { address, password } = req.body;

  if (!address || !password) {
    return res.redirect('/admin?error=address_and_password_required');
  }

  if (!ADDRESS_RE.test(address)) {
    return res.redirect('/admin?error=invalid_address');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.redirect('/admin?error=password_too_short');
  }

  const existing = await findInboxByAddress(address);
  if (existing) {
    return res.redirect('/admin?error=inbox_exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const apiKey = uuidv4();

  try {
    await createInbox(address, passwordHash, apiKey);
    req.session.createdInboxApiKey = apiKey;
    req.session.createdInboxAddress = address;
    res.redirect('/admin');
  } catch (err) {
    console.error('Error creating inbox:', err);
    res.redirect('/admin?error=create_failed');
  }
});

// Toggle disable inbox
router.post('/inboxes/:id/disable', requireAdminAuth, async (req, res) => {
  const inbox = await findInboxById(req.params.id);
  if (!inbox) {
    return res.status(404).send('Not Found');
  }

  if (inbox.disabled) {
    await enableInbox(inbox.id);
  } else {
    await disableInbox(inbox.id);
  }

  res.redirect('/admin');
});

// Delete inbox
router.post('/inboxes/:id/delete', requireAdminAuth, async (req, res) => {
  const inbox = await findInboxById(req.params.id);
  if (!inbox) {
    return res.status(404).send('Not Found');
  }

  await deleteInbox(inbox.id);
  res.redirect('/admin');
});

// --- Admin API (Basic auth, JSON) ---

// Create inbox (API)
router.post('/api/inboxes', requireAdminApiAuth, async (req, res) => {
  const { address, password } = req.body || {};

  if (!address || !password) {
    return res.status(400).json({ error: 'address and password are required' });
  }

  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'invalid address format' });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  const existing = await findInboxByAddress(address);
  if (existing) {
    return res.status(409).json({ error: 'inbox already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const apiKey = uuidv4();

  try {
    const inbox = await createInbox(address, passwordHash, apiKey);
    return res.status(201).json({
      id: inbox.id,
      address: inbox.address,
      api_key: inbox.api_key
    });
  } catch (err) {
    console.error('Error creating inbox:', err);
    return res.status(500).json({ error: 'failed to create inbox' });
  }
});

// Delete inbox (API)
router.delete('/api/inboxes/:id', requireAdminApiAuth, async (req, res) => {
  const inbox = await findInboxById(req.params.id);
  if (!inbox) {
    return res.status(404).json({ error: 'Not Found' });
  }

  await deleteInbox(inbox.id);
  return res.status(200).json({ ok: true });
});

module.exports = router;
