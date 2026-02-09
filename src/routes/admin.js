const express = require('express');
const crypto = require('crypto');
const {
  listAllInboxes,
  findInboxById,
  disableInbox,
  enableInbox,
  deleteInbox
} = require('../db');
const { createRateLimiter } = require('../rateLimit');

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
  res.render('admin/dashboard', { inboxes });
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

module.exports = router;
