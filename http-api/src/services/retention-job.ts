import { Pool } from 'pg';
import * as cron from 'node-cron';
import { S3ClientWrapper } from './s3-service';

export function startRetentionJob(db: Pool) {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Starting retention job...');
    await runRetentionJob(db);
  });

  console.log('Retention job scheduled to run daily at 2 AM');
}

async function runRetentionJob(db: Pool) {
  try {
    // Get all users with their retention settings
    const usersResult = await db.query('SELECT id, retention_days FROM users');

    for (const user of usersResult.rows) {
      const retentionDays = user.retention_days || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Get emails to delete
      const emailsResult = await db.query(
        'SELECT id, attachments FROM emails WHERE user_id = $1 AND received_at < $2',
        [user.id, cutoffDate]
      );

      for (const email of emailsResult.rows) {
        // Delete attachments from S3 if applicable
        if (email.attachments && Array.isArray(email.attachments)) {
          // Note: S3 deletion would need to be implemented if needed
          // For now, we just delete the database records
        }

        // Delete email record (cascade will handle webhook_logs)
        await db.query('DELETE FROM emails WHERE id = $1', [email.id]);
      }

      console.log(`Deleted ${emailsResult.rows.length} emails for user ${user.id}`);
    }

    console.log('Retention job completed');
  } catch (error) {
    console.error('Error running retention job:', error);
  }
}
