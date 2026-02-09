const express = require('express');
const {
  findInboxByApiKey,
  listEmails,
  getEmail,
  deleteEmail,
  listAttachments,
  getAttachment
} = require('../db');

const router = express.Router();

// API auth middleware
async function requireApiAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).send('Unauthorized');
  }

  const inbox = await findInboxByApiKey(apiKey);
  if (!inbox) {
    return res.status(401).send('Unauthorized');
  }

  if (inbox.disabled) {
    return res.status(403).send('Forbidden');
  }

  req.inbox = inbox;
  next();
}

// List emails
router.get('/emails', requireApiAuth, async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);

  // Build filters from remaining query params
  const { limit: _l, offset: _o, ...filterParams } = req.query;
  const filters = {};
  for (const [key, value] of Object.entries(filterParams)) {
    if (typeof value === 'string' && value.length > 0) {
      filters[key] = value;
    }
  }

  const emails = await listEmails(req.inbox.id, limit, offset, filters);
  res.json(emails);
});

// Get email
router.get('/emails/:id', requireApiAuth, async (req, res) => {
  const email = await getEmail(req.params.id, req.inbox.id);
  if (!email) {
    return res.status(404).send('Not Found');
  }

  res.json(email);
});

// Delete email
router.delete('/emails/:id', requireApiAuth, async (req, res) => {
  const email = await getEmail(req.params.id, req.inbox.id);
  if (!email) {
    return res.status(404).send('Not Found');
  }

  await deleteEmail(req.params.id, req.inbox.id);
  res.status(200).send('OK');
});

// List attachments
router.get('/emails/:id/attachments', requireApiAuth, async (req, res) => {
  const email = await getEmail(req.params.id, req.inbox.id);
  if (!email) {
    return res.status(404).send('Not Found');
  }

  const attachments = await listAttachments(email.id);
  res.json(attachments);
});

// Get attachment
router.get('/emails/:id/attachments/:attachmentId', requireApiAuth, async (req, res) => {
  const email = await getEmail(req.params.id, req.inbox.id);
  if (!email) {
    return res.status(404).send('Not Found');
  }

  const attachment = await getAttachment(req.params.attachmentId, req.params.id);
  if (!attachment) {
    return res.status(404).send('Not Found');
  }

  res.setHeader('Content-Type', attachment.content_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename || 'attachment'}"`);
  res.send(attachment.content);
});

module.exports = router;
