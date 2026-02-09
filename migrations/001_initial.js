/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('inboxes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    address: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    api_key: { type: 'varchar(255)', notNull: true, unique: true },
    webhook_url: { type: 'text' },
    disabled: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') }
  });

  pgm.createTable('emails', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    inbox_id: { type: 'uuid', notNull: true, references: 'inboxes(id)', onDelete: 'CASCADE' },
    from: { type: 'text' },
    to: { type: 'text' },
    subject: { type: 'text' },
    text_body: { type: 'text' },
    html_body: { type: 'text' },
    raw: { type: 'text' },
    received_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') }
  });

  pgm.createIndex('emails', 'inbox_id, received_at DESC', { name: 'idx_emails_inbox_received' });

  pgm.createTable('attachments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email_id: { type: 'uuid', notNull: true, references: 'emails(id)', onDelete: 'CASCADE' },
    filename: { type: 'text' },
    content_type: { type: 'text' },
    size: { type: 'integer' },
    content: { type: 'bytea' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('attachments');
  pgm.dropTable('emails');
  pgm.dropTable('inboxes');
};
