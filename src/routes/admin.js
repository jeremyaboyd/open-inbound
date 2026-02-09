const express = require('express');
const crypto = require('crypto');
const {
  listAllInboxes,
  findInboxById,
  disableInbox,
  enableInbox,
  deleteInbox
} = require('../db');

const router = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

// Timing-safe comparison
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Admin login
router.get('/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(404).send('Not Found');
  }
  res.render('admin/login');
});

router.post('/login', (req, res) => {
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
