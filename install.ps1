# Open Inbound Installation Script for PowerShell

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Open Inbound Installation Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Function to generate random password
function Generate-Password {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    $password = ""
    for ($i = 0; $i -lt 25; $i++) {
        $password += $chars[(Get-Random -Maximum $chars.Length)]
    }
    return $password
}

# Function to prompt with default
function Prompt-WithDefault {
    param(
        [string]$PromptText,
        [string]$DefaultValue
    )
    $result = Read-Host "$PromptText [$DefaultValue]"
    if ([string]::IsNullOrWhiteSpace($result)) {
        return $DefaultValue
    }
    return $result
}

# Collect configuration
Write-Host "Configuration Setup" -ForegroundColor Yellow
Write-Host "-------------------" -ForegroundColor Yellow
Write-Host ""

$SMTP_HOST = Prompt-WithDefault "SMTP Hostname" "localhost"
$HTTP_HOST = Prompt-WithDefault "HTTP Hostname" "localhost"
$DOMAIN_NAME = Prompt-WithDefault "Domain Name" "localhost"

Write-Host ""
Write-Host "Admin Account Setup" -ForegroundColor Yellow
Write-Host "-------------------" -ForegroundColor Yellow
$ADMIN_USERNAME = Prompt-WithDefault "Admin Username" "admin"
$ADMIN_PASSWORD = Generate-Password
Write-Host "Generated admin password: $ADMIN_PASSWORD" -ForegroundColor Green
Write-Host "Please save this password securely!" -ForegroundColor Yellow

Write-Host ""
Write-Host "Database Configuration" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow
$POSTGRES_USER = Prompt-WithDefault "PostgreSQL Username" "openinbound"
$POSTGRES_PASSWORD = Generate-Password
$POSTGRES_DB = Prompt-WithDefault "PostgreSQL Database Name" "openinbound"
$POSTGRES_PORT = Prompt-WithDefault "PostgreSQL Port" "5432"

Write-Host ""
Write-Host "S3 Storage Configuration" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Yellow
Write-Host "Options: local, remote, database, none"
$S3_TYPE = Prompt-WithDefault "S3 Storage Type" "none"

$S3_ENDPOINT = ""
$S3_ACCESS_KEY = ""
$S3_SECRET_KEY = ""
$S3_BUCKET = "attachments"
$MINIO_ROOT_USER = ""
$MINIO_ROOT_PASSWORD = ""

if ($S3_TYPE -eq "local") {
    $S3_ENDPOINT = Prompt-WithDefault "MinIO Endpoint" "http://minio:9000"
    $MINIO_ROOT_USER = Prompt-WithDefault "MinIO Root User" "minioadmin"
    $MINIO_ROOT_PASSWORD = Generate-Password
    Write-Host "Generated MinIO password: $MINIO_ROOT_PASSWORD" -ForegroundColor Green
    $S3_ACCESS_KEY = $MINIO_ROOT_USER
    $S3_SECRET_KEY = $MINIO_ROOT_PASSWORD
} elseif ($S3_TYPE -eq "remote") {
    $S3_ENDPOINT = Prompt-WithDefault "S3 Endpoint URL" ""
    $S3_ACCESS_KEY = Prompt-WithDefault "S3 Access Key" ""
    $S3_SECRET_KEY = Prompt-WithDefault "S3 Secret Key" ""
    $S3_BUCKET = Prompt-WithDefault "S3 Bucket Name" "attachments"
}

Write-Host ""
Write-Host "Application Settings" -ForegroundColor Yellow
Write-Host "--------------------" -ForegroundColor Yellow
$REGISTRATION_ENABLED = Prompt-WithDefault "Enable User Registration (true/false)" "true"
$DEFAULT_RETENTION_DAYS = Prompt-WithDefault "Default Retention Period (days)" "30"

# Generate JWT secret
$JWT_SECRET = Generate-Password

# Create .env file
Write-Host ""
Write-Host "Creating .env file..." -ForegroundColor Yellow

$envContent = @"
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
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8

Write-Host ".env file created successfully!" -ForegroundColor Green
Write-Host ""

# Build Docker images
Write-Host "Building Docker images..." -ForegroundColor Yellow
docker-compose build

# Start services
Write-Host ""
Write-Host "Starting services..." -ForegroundColor Yellow
if ($S3_TYPE -eq "local") {
    docker-compose --profile s3-local up -d postgres minio
} else {
    docker-compose up -d postgres
}

# Wait for database to be ready
Write-Host ""
Write-Host "Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Start remaining services
docker-compose up -d

# Wait a bit for services to start
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services are running:" -ForegroundColor Yellow
Write-Host "  - SMTP: ${SMTP_HOST}:25"
Write-Host "  - HTTP API: http://${HTTP_HOST}:3000"
Write-Host "  - Admin UI: http://${HTTP_HOST}:3000/admin.html"
if ($S3_TYPE -eq "local") {
    Write-Host "  - MinIO Console: http://${HTTP_HOST}:9001"
}
Write-Host ""
Write-Host "Admin Credentials (save these!):" -ForegroundColor Yellow
Write-Host "  Email: ${ADMIN_USERNAME}@${DOMAIN_NAME}"
Write-Host "  Password: $ADMIN_PASSWORD" -ForegroundColor Red
Write-Host ""
Write-Host "IMPORTANT: Create the admin user using one of these methods:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Via Admin UI (recommended):" -ForegroundColor Cyan
Write-Host "   - Open http://${HTTP_HOST}:3000/admin.html"
Write-Host "   - Register a new account with: ${ADMIN_USERNAME}@${DOMAIN_NAME}"
Write-Host "   - Use password: $ADMIN_PASSWORD"
Write-Host ""
Write-Host "2. Via API:" -ForegroundColor Cyan
Write-Host "   Invoke-RestMethod -Uri http://${HTTP_HOST}:3000/api/auth/register -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{email='${ADMIN_USERNAME}@${DOMAIN_NAME}';password='$ADMIN_PASSWORD'})"
Write-Host ""
Write-Host "To stop services: docker-compose down"
Write-Host "To view logs: docker-compose logs -f"
Write-Host ""
