# Open-Inbound

A simple, self-hosted, inbound-only SMTP server with a web UI and REST API. Designed to be embedded into other applications, not to be a full-featured email platform.

## Quick Start

```bash
git pull
docker compose up
```

## Environment Configuration

| Variable | Description | Default |
|---|---|---|
| `DOMAIN` | The domain the SMTP server accepts mail for (must be a real domain for Traefik TLS) | `localhost` |
| `ACME_EMAIL` | Email for Let's Encrypt certificate registration (required when using Traefik) | - |
| `RETENTION_DAYS` | Delete emails older than this many days | `30` |
| `ATTACHMENTS_ENABLED` | Store attachments (`true`/`false`) | `true` |
| `SMTP_PORT` | SMTP listener port | `25` |
| `WEB_PORT` | Web UI / API port | `3000` |
| `DATABASE_URL` | Postgres connection string | `postgres://smtp:smtp@db:5432/smtp` |
| `ADMIN_USERNAME` | Admin panel username (leave empty to disable) | - |
| `ADMIN_PASSWORD` | Admin panel password (leave empty to disable) | - |

## Docker Services

1. **traefik** — Reverse proxy handling TLS termination and automatic Let's Encrypt certificates. Exposes ports 80, 443, and 25.
2. **app** — Node.js process running the SMTP server, web UI, REST API, and retention job.
3. **db** — PostgreSQL.

### Traefik Setup

With Traefik in front:

- **Web UI**: Access via `https://${DOMAIN}` (HTTP redirects to HTTPS)
- **SMTP**: Port 25 is proxied to the app. STARTTLS is disabled on the app (Traefik cannot terminate SMTP STARTTLS); mail is accepted over plain connections only.

For production, set `DOMAIN` and `ACME_EMAIL` in `.env`. Your domain must resolve to the server's public IP for Let's Encrypt to issue certificates.

The retention job runs as a daily cron within the app container (using `node-cron`), not as a separate service.

## Core Concepts

### Inbox

An inbox is a mailbox tied to a local address (e.g. `notifications@DOMAIN`). Each inbox has:

- **Address** — the local-part (unique per domain)
- **Password** — set at creation, used to log into the web UI for that inbox
- **API Key** — auto-generated at creation, used to authenticate REST API calls
- **Webhook URL** (optional) — if set, the server POSTs the full email payload (JSON) to this URL on receipt

There is no global admin. Each inbox is self-contained (unless admin panel is enabled).

### Email

An inbound email received by the SMTP server. Stored in Postgres. Fields:

- `id`
- `inbox_id`
- `from`
- `to`
- `subject`
- `text_body`
- `html_body`
- `raw` (full raw MIME message)
- `received_at`

### Attachment

If `ATTACHMENTS_ENABLED=true`, attachments are parsed from the MIME message and stored as rows linked to the email. Fields:

- `id`
- `email_id`
- `filename`
- `content_type`
- `size`
- `content` (binary, stored in Postgres as `bytea`)

If `ATTACHMENTS_ENABLED=false`, attachments are silently discarded.

## SMTP Server

- Inbound only. No sending.
- Listen on `SMTP_PORT`.
- Accept mail for any address `*@DOMAIN`.
- If no inbox matches the `to` address, silently discard the message.
- If an inbox matches, parse the message (using `mailparser`), store it, and fire the webhook if configured.
- No TLS required (intended to sit behind a reverse proxy or on a private network).

### Adding TLS Support

To add TLS support, you can configure the SMTP server in `src/smtp.js` with TLS options:

```javascript
const server = new SMTPServer({
  secure: true,
  key: fs.readFileSync('/path/to/key.pem'),
  cert: fs.readFileSync('/path/to/cert.pem'),
  // ... other options
});
```

## Web UI

Minimal. Functional. Server-rendered HTML.

### Pages

1. **Home (`/`)** — Form to create a new inbox (address + password). Link to login.
2. **Login (`/login`)** — Address + password. Sets a session cookie.
3. **Inbox (`/inbox`)** — Requires auth. Lists emails (newest first, paginated). Shows subject, from, date. Click to view.
4. **Email detail (`/inbox/emails/:id`)** — Full email view (text or HTML body). List of attachments with download links. Delete button.
5. **Settings (`/inbox/settings`)** — View/regenerate API key. Set/update webhook URL.

## REST API

All API routes are prefixed with `/api`. Authenticated via `X-API-Key` header.

### Endpoints

#### `GET /api/emails`

List emails in the inbox. Returns JSON array. Supports `?limit=` and `?offset=` query params.

#### `GET /api/emails/:id`

Get a single email by ID. Returns full JSON payload including text/html bodies.

#### `DELETE /api/emails/:id`

Delete a single email and its attachments.

#### `GET /api/emails/:id/attachments`

List attachments for an email (id, filename, content_type, size).

#### `GET /api/emails/:id/attachments/:attachmentId`

Download a single attachment. Returns the binary file with appropriate content-type.

### Response Format

Use standard HTTP status codes and messages. No error wrappers.

- **200** — return the data directly as JSON
- **401** — invalid or missing API key
- **403** — inbox is disabled
- **404** — email or attachment not found
- **500** — server error

Success example:

```json
{ "id": "...", "from": "...", "subject": "..." }
```

Errors use the standard HTTP status and reason phrase. No custom error body needed.

## Webhook

When an inbox has a webhook URL configured and an email is received:

1. POST the email as JSON to the webhook URL.
2. Include attachments as base64-encoded fields in the payload if `ATTACHMENTS_ENABLED=true`.
3. Fire and forget. Log failures but do not retry.

## Admin Panel

If `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set, an admin panel is available at `/admin`.

- **Login (`/admin/login`)** — Admin username + password
- **Dashboard (`/admin`)** — List all inboxes with disable/delete controls
- Disabled inboxes ignore new emails and prevent API calls

## Data Retention

A scheduled job runs once daily inside the app container. It deletes all emails (and their attachments) where `received_at` is older than `RETENTION_DAYS`. Logs how many records were deleted.

## License

MIT
