# Open Inbound

A receive-only SMTP service with Docker containers, user management, email storage in PostgreSQL, REST API/Webhook support, and admin interface.

## Features

- **Receive-only SMTP Server** - Accepts emails and stores them in PostgreSQL
- **REST API** - Retrieve emails via HTTP API endpoints
- **Webhook Support** - Get notified when new emails arrive
- **Admin Interface** - Web-based UI for managing users and settings
- **User Management** - Create and manage inboxes/users with granular permissions
- **Attachment Storage** - Support for local MinIO, remote S3, database storage, or none
- **Retention Policy** - Automatic cleanup of old emails based on configurable retention periods
- **Docker-based** - Easy deployment with Docker Compose

## Quick Start

### Prerequisites

The installation script will check for these automatically:

- **Docker** - Required for running containers
- **Docker Compose** - Required for orchestrating services (can be `docker-compose` command or `docker compose` plugin)
- **OpenSSL** - Required for generating secure passwords (usually pre-installed on Linux)
- **Git** - Optional, but recommended for cloning the repository

### Installation

1. Clone the repository:
```bash
git clone https://github.com/jeremyaboyd/open-inbound.git
cd open-inbound
```

2. Run the installation script:
```bash
# Linux/macOS
# Option 1: Make executable and run
chmod +x install.sh
sudo ./install.sh

# Option 2: Run directly with bash
sudo bash install.sh

# Windows PowerShell
.\install.ps1
```

The installation script will:
- Prompt you for configuration values (with sensible defaults)
- Generate secure random passwords
- Create the `.env` file
- Build Docker images
- Start all services
- Create the admin user

3. Access the admin interface:
   - Open your browser to `http://localhost:3000/admin.html`
   - Login with the credentials provided during installation

## Architecture

### Docker Containers

- **SMTP Service** - Receives emails on port 25
- **HTTP API** - REST API and admin UI on port 3000
- **PostgreSQL** - Database for storing emails and user data
- **MinIO** (optional) - Local S3-compatible storage for attachments

### Data Flow

```
Email → SMTP Container → Validate Recipient → Store in PostgreSQL → Upload Attachments to S3 (if enabled) → Trigger Webhook (if configured)
```

```
User → HTTP API → Authenticate → Query PostgreSQL → Return Emails (JSON)
```

## Configuration

All configuration is done through environment variables in the `.env` file. Key settings include:

- `SMTP_HOST` / `SMTP_PORT` - SMTP server configuration
- `HTTP_HOST` / `HTTP_PORT` - HTTP API configuration
- `DOMAIN_NAME` - Domain name for email addresses
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT authentication tokens
- `S3_TYPE` - Storage type: `local`, `remote`, `database`, or `none`
- `REGISTRATION_ENABLED` - Enable/disable user registration
- `DEFAULT_RETENTION_DAYS` - Default email retention period

## API Documentation

### Authentication

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "username@domain.com",
  "password": "password"
}
```

#### Register (if enabled)
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "username@domain.com",
  "password": "password"
}
```

### Email Endpoints

All email endpoints require authentication via Bearer token.

#### List Emails
```http
GET /api/emails?limit=50&offset=0
Authorization: Bearer <token>
```

#### Get Email
```http
GET /api/emails/:id
Authorization: Bearer <token>
```

#### Download Attachment
```http
GET /api/emails/:id/attachments/:attachmentId
Authorization: Bearer <token>
```

### Admin Endpoints

Admin endpoints require authentication and admin privileges.

#### List Users
```http
GET /api/admin/users
Authorization: Bearer <token>
```

#### Create User
```http
POST /api/admin/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "user",
  "domain": "example.com",
  "password": "password",
  "api_access_enabled": true,
  "webhook_enabled": false,
  "retention_days": 30,
  "attachments_enabled": true
}
```

#### Update User
```http
PUT /api/admin/users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "webhook_enabled": true,
  "webhook_url": "https://example.com/webhook",
  "retention_days": 60
}
```

#### Delete User
```http
DELETE /api/admin/users/:id
Authorization: Bearer <token>
```

#### Get Settings
```http
GET /api/admin/settings
Authorization: Bearer <token>
```

#### Update Settings
```http
PUT /api/admin/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "default_retention_days": 30,
  "registration_enabled": true,
  "s3_type": "local"
}
```

## Webhooks

When a user has webhooks enabled, the system will POST to the configured webhook URL whenever a new email is received.

### Webhook Payload

```json
{
  "id": "email-uuid",
  "messageId": "<message-id@domain>",
  "from": "sender@example.com",
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "body": { /* parsed email structure */ },
  "receivedAt": "2024-01-01T00:00:00Z",
  "attachmentCount": 0,
  "attachments": []
}
```

## User Management

### User Properties

- **username** - Username part of email address
- **domain** - Domain part of email address
- **api_access_enabled** - Allow API access
- **webhook_enabled** - Enable webhook notifications
- **webhook_url** - Webhook endpoint URL
- **retention_days** - Email retention period (days)
- **attachments_enabled** - Allow attachments (requires S3 configured)
- **banned_until** - Optional ban expiration date

## Retention Policy

Emails are automatically deleted based on the retention period:
- Default retention period is configurable in settings
- Each user can have a custom retention period
- Retention job runs daily at 2 AM
- Deleted emails cascade delete webhook logs

## S3 Storage Options

1. **None** - Attachments are ignored
2. **Local (MinIO)** - Uses MinIO container for local S3 storage
3. **Remote S3** - Uses external S3-compatible service
4. **Database** - Stores attachments as base64 in PostgreSQL

## Updating

To update Open Inbound to the latest version while preserving your configuration:

```bash
# Linux/macOS
sudo bash update.sh

# Windows PowerShell
.\update.ps1
```

The update script will:
- Pull the latest changes from Git
- Backup your `.env` file
- Rebuild Docker images
- Restart containers with your existing configuration

**Note:** Your configuration (`.env` file) will be preserved during updates.

## Development

### Building

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build smtp-service
docker-compose build http-api
```

### Running Locally

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Project Structure

```
open-inbound/
├── docker-compose.yml      # Docker Compose configuration
├── .env.example            # Example environment variables
├── install.sh              # Linux/macOS installation script
├── install.ps1             # Windows PowerShell installation script
├── update.sh               # Linux/macOS update script
├── update.ps1              # Windows PowerShell update script
├── smtp-service/           # SMTP service code
├── http-api/               # HTTP API service code
├── database/               # Database schema and migrations
└── README.md               # This file
```

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

## Support

[Add support information here]
