const cron = require('node-cron');
const { deleteOldEmails } = require('./db');

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '30', 10);

function startRetentionJob() {
  // Run daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    try {
      const deletedCount = await deleteOldEmails(RETENTION_DAYS);
      console.log(`Retention cleanup: deleted ${deletedCount} emails older than ${RETENTION_DAYS} days`);
    } catch (error) {
      console.error('Retention job error:', error);
    }
  });

  console.log(`Retention job scheduled: daily at 3 AM, deleting emails older than ${RETENTION_DAYS} days`);
}

module.exports = { startRetentionJob };
