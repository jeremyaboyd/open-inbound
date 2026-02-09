const SMTPServer = require('smtp-server').SMTPServer;
const { simpleParser } = require('mailparser');
const { findInboxByAddress, insertEmail, insertAttachment } = require('./db');
const { fireWebhook } = require('./webhook');

const DOMAIN = process.env.DOMAIN || 'localhost';
const ATTACHMENTS_ENABLED = process.env.ATTACHMENTS_ENABLED !== 'false';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '25', 10);

function startSmtp() {
  const server = new SMTPServer({
    name: DOMAIN,
    authMethods: [],
    disabledCommands: ['AUTH'],
    size: 10 * 1024 * 1024,       // 10 MB max message size
    maxClients: 50,                // limit concurrent connections
    onData(stream, session, callback) {
      // Collect raw message first
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        const messageBuffer = Buffer.concat(chunks);
        const rawMessage = messageBuffer.toString('utf8');
        
        // Now parse the message
        simpleParser(messageBuffer, async (err, parsed) => {
          if (err) {
            console.error('Error parsing email:', err);
            return callback(err);
          }

          try {
            // Extract recipient address (local part only)
            const toAddress = parsed.to?.value?.[0]?.address || session.envelope.rcptTo[0]?.address;
            if (!toAddress) {
              console.log('No recipient address found, discarding');
              return callback();
            }

            // Extract local part (before @)
            const localPart = toAddress.split('@')[0];
            const domain = toAddress.split('@')[1];

            // Check if domain matches
            if (domain !== DOMAIN) {
              console.log(`Domain mismatch: ${domain} != ${DOMAIN}, discarding`);
              return callback();
            }

            // Find inbox
            const inbox = await findInboxByAddress(localPart);
            
            // If no inbox or inbox is disabled, silently discard
            if (!inbox || inbox.disabled) {
              console.log(`No inbox found or inbox disabled for ${localPart}, discarding`);
              return callback();
            }

            // Store email
            const emailId = await insertEmail(
              inbox.id,
              parsed.from?.value?.[0]?.address || parsed.from?.text || '',
              toAddress,
              parsed.subject || '',
              parsed.text || '',
              parsed.html || '',
              rawMessage
            );

          // Store attachments if enabled
          if (ATTACHMENTS_ENABLED && parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
              await insertAttachment(
                emailId,
                attachment.filename || 'unnamed',
                attachment.contentType || 'application/octet-stream',
                attachment.size || 0,
                attachment.content
              );
            }
          }

          // Fire webhook if configured
          if (inbox.webhook_url) {
            const attachments = ATTACHMENTS_ENABLED && parsed.attachments
              ? parsed.attachments.map(att => ({
                  filename: att.filename || 'unnamed',
                  content_type: att.contentType || 'application/octet-stream',
                  size: att.size || 0,
                  content: att.content.toString('base64')
                }))
              : [];

            fireWebhook(inbox.webhook_url, {
              id: emailId,
              inbox_id: inbox.id,
              from: parsed.from?.value?.[0]?.address || parsed.from?.text || '',
              to: toAddress,
              subject: parsed.subject || '',
              text_body: parsed.text || '',
              html_body: parsed.html || '',
              received_at: new Date().toISOString()
            }, attachments).catch(err => {
              console.error('Webhook error (logged but continuing):', err.message);
            });
          }

            console.log(`Email stored for inbox ${localPart} (${emailId})`);
            callback();
          } catch (error) {
            console.error('Error processing email:', error);
            callback(error);
          }
        });
      });
    }
  });

  server.listen(SMTP_PORT, () => {
    console.log(`SMTP server listening on port ${SMTP_PORT} for domain ${DOMAIN}`);
  });

  server.on('error', (err) => {
    console.error('SMTP server error:', err);
  });
}

module.exports = { startSmtp };
