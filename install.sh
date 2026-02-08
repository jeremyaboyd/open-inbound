#!/bin/bash

set -e

echo "=========================================="
echo "Open Inbound Installation Script"
echo "=========================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."
echo ""

MISSING_DEPS=0

# Check for Docker
if ! command_exists docker; then
    echo "ERROR: Docker is not installed."
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    MISSING_DEPS=1
else
    echo "✓ Docker found: $(docker --version)"
fi

# Check for Docker Compose (try both 'docker-compose' and 'docker compose')
DOCKER_COMPOSE_CMD=""
if command_exists docker-compose; then
    DOCKER_COMPOSE_CMD="docker-compose"
    echo "✓ docker-compose found: $(docker-compose --version)"
elif docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
    echo "✓ docker compose found: $(docker compose version)"
else
    echo "ERROR: Docker Compose is not installed."
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    MISSING_DEPS=1
fi

# Check for OpenSSL (for password generation)
if ! command_exists openssl; then
    echo "ERROR: OpenSSL is not installed."
    echo "Please install OpenSSL (usually included in most Linux distributions)"
    MISSING_DEPS=1
else
    echo "✓ OpenSSL found: $(openssl version | cut -d' ' -f1-2)"
fi

# Check for Git (optional but recommended)
if command_exists git; then
    echo "✓ Git found: $(git --version | cut -d' ' -f1-3)"
else
    echo "WARNING: Git is not installed (optional, but recommended)"
fi

echo ""

if [ $MISSING_DEPS -eq 1 ]; then
    echo "=========================================="
    echo "ERROR: Missing required prerequisites!"
    echo "Please install the missing dependencies and run this script again."
    echo "=========================================="
    exit 1
fi

echo "All prerequisites met!"
echo ""

# Function to generate random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Function to prompt with default
prompt_with_default() {
    local prompt_text=$1
    local default_value=$2
    local result
    
    read -p "$prompt_text [$default_value]: " result
    echo "${result:-$default_value}"
}

# Collect configuration
echo "Configuration Setup"
echo "-------------------"
echo ""

SMTP_HOST=$(prompt_with_default "SMTP Hostname" "localhost")
HTTP_HOST=$(prompt_with_default "HTTP Hostname" "localhost")
DOMAIN_NAME=$(prompt_with_default "Domain Name" "localhost")

echo ""
echo "Admin Account Setup"
echo "-------------------"
ADMIN_USERNAME=$(prompt_with_default "Admin Username" "admin")
ADMIN_PASSWORD=$(generate_password)
echo "Generated admin password: $ADMIN_PASSWORD"
echo "Please save this password securely!"

echo ""
echo "Database Configuration"
echo "----------------------"
POSTGRES_USER=$(prompt_with_default "PostgreSQL Username" "openinbound")
POSTGRES_PASSWORD=$(generate_password)
POSTGRES_DB=$(prompt_with_default "PostgreSQL Database Name" "openinbound")
POSTGRES_PORT=$(prompt_with_default "PostgreSQL Port" "5432")

echo ""
echo "S3 Storage Configuration"
echo "------------------------"
echo "Options: local, remote, database, none"
S3_TYPE=$(prompt_with_default "S3 Storage Type" "none")

S3_ENDPOINT=""
S3_ACCESS_KEY=""
S3_SECRET_KEY=""
S3_BUCKET="attachments"

if [ "$S3_TYPE" = "local" ]; then
    S3_ENDPOINT=$(prompt_with_default "MinIO Endpoint" "http://minio:9000")
    MINIO_ROOT_USER=$(prompt_with_default "MinIO Root User" "minioadmin")
    MINIO_ROOT_PASSWORD=$(generate_password)
    echo "Generated MinIO password: $MINIO_ROOT_PASSWORD"
    S3_ACCESS_KEY=$MINIO_ROOT_USER
    S3_SECRET_KEY=$MINIO_ROOT_PASSWORD
elif [ "$S3_TYPE" = "remote" ]; then
    S3_ENDPOINT=$(prompt_with_default "S3 Endpoint URL" "")
    S3_ACCESS_KEY=$(prompt_with_default "S3 Access Key" "")
    S3_SECRET_KEY=$(prompt_with_default "S3 Secret Key" "")
    S3_BUCKET=$(prompt_with_default "S3 Bucket Name" "attachments")
fi

echo ""
echo "Application Settings"
echo "--------------------"
REGISTRATION_ENABLED=$(prompt_with_default "Enable User Registration (true/false)" "true")
DEFAULT_RETENTION_DAYS=$(prompt_with_default "Default Retention Period (days)" "30")

# Generate JWT secret
JWT_SECRET=$(generate_password)

# Create .env file
echo ""
echo "Creating .env file..."
cat > .env << EOF
# Database Configuration
POSTGRES_DB=$POSTGRES_DB
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_PORT=$POSTGRES_PORT

# SMTP Configuration
SMTP_HOST=0.0.0.0
SMTP_PORT=25
DOMAIN_NAME=$DOMAIN_NAME

# HTTP API Configuration
HTTP_HOST=0.0.0.0
HTTP_PORT=3000

# JWT Secret
JWT_SECRET=$JWT_SECRET

# Registration
REGISTRATION_ENABLED=$REGISTRATION_ENABLED

# Default Retention
DEFAULT_RETENTION_DAYS=$DEFAULT_RETENTION_DAYS

# S3 Configuration
S3_TYPE=$S3_TYPE
S3_ENDPOINT=$S3_ENDPOINT
S3_ACCESS_KEY=$S3_ACCESS_KEY
S3_SECRET_KEY=$S3_SECRET_KEY
S3_BUCKET=$S3_BUCKET
S3_REGION=us-east-1

# MinIO Configuration (for local S3)
MINIO_ROOT_USER=$MINIO_ROOT_USER
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
EOF

echo ".env file created successfully!"
echo ""

# Build Docker images
echo "Building Docker images..."
$DOCKER_COMPOSE_CMD build

# Start services
echo ""
echo "Starting services..."
if [ "$S3_TYPE" = "local" ]; then
    $DOCKER_COMPOSE_CMD --profile s3-local up -d postgres minio
else
    $DOCKER_COMPOSE_CMD up -d postgres
fi

# Wait for database to be ready
echo ""
echo "Waiting for database to be ready..."
sleep 10

# Start remaining services
$DOCKER_COMPOSE_CMD up -d

# Wait a bit for services to start
sleep 5

# Note: Admin user should be created via the admin interface or API

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Services are running:"
echo "  - SMTP: $SMTP_HOST:25"
echo "  - HTTP API: http://$HTTP_HOST:3000"
echo "  - Admin UI: http://$HTTP_HOST:3000/admin.html"
if [ "$S3_TYPE" = "local" ]; then
    echo "  - MinIO Console: http://$HTTP_HOST:9001"
fi
echo ""
echo "Admin Credentials (save these!):"
echo "  Email: $ADMIN_USERNAME@$DOMAIN_NAME"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "IMPORTANT: Create the admin user using one of these methods:"
echo ""
echo "1. Via Admin UI (recommended):"
echo "   - Open http://$HTTP_HOST:3000/admin.html"
echo "   - Register a new account with: $ADMIN_USERNAME@$DOMAIN_NAME"
echo "   - Use password: $ADMIN_PASSWORD"
echo ""
echo "2. Via API:"
echo "   curl -X POST http://$HTTP_HOST:3000/api/auth/register \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"$ADMIN_USERNAME@$DOMAIN_NAME\",\"password\":\"$ADMIN_PASSWORD\"}'"
echo ""
echo "To stop services: docker-compose down"
echo "To view logs: docker-compose logs -f"
echo ""
