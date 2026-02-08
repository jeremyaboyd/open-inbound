# Open Inbound Update Script for PowerShell

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Open Inbound Update Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

# Check for Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed." -ForegroundColor Red
    exit 1
}

# Check for Docker Compose
$DOCKER_COMPOSE_CMD = $null
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $DOCKER_COMPOSE_CMD = "docker-compose"
} elseif (docker compose version 2>$null) {
    $DOCKER_COMPOSE_CMD = "docker compose"
} else {
    Write-Host "ERROR: Docker Compose is not installed." -ForegroundColor Red
    exit 1
}

# Check for Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Git is not installed." -ForegroundColor Red
    exit 1
}

Write-Host "✓ All prerequisites met" -ForegroundColor Green
Write-Host ""

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Yellow
    Write-Host "The update script will preserve your configuration, but no .env file was found."
    Write-Host "If this is a fresh installation, run install.ps1 instead."
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "Update cancelled."
        exit 1
    }
} else {
    Write-Host "✓ Configuration file (.env) found" -ForegroundColor Green
}

# Backup .env file
if (Test-Path ".env") {
    Write-Host "Backing up .env file..." -ForegroundColor Yellow
    $backupName = ".env.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item ".env" $backupName
    Write-Host "✓ Backup created: $backupName" -ForegroundColor Green
}

Write-Host ""
Write-Host "Pulling latest changes from Git..." -ForegroundColor Yellow
Write-Host ""

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "WARNING: Not a git repository. Skipping git pull." -ForegroundColor Yellow
    Write-Host "If you cloned without .git, you may need to re-clone the repository."
    $response = Read-Host "Continue with Docker rebuild? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "Update cancelled."
        exit 1
    }
} else {
    # Get current branch
    $CURRENT_BRANCH = git rev-parse --abbrev-ref HEAD
    Write-Host "Current branch: $CURRENT_BRANCH" -ForegroundColor Cyan
    
    # Pull latest changes
    try {
        git pull origin $CURRENT_BRANCH
        Write-Host "✓ Git pull completed" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to pull from git. Please resolve conflicts and try again." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Stopping existing containers..." -ForegroundColor Yellow
Invoke-Expression "$DOCKER_COMPOSE_CMD down"

Write-Host ""
Write-Host "Rebuilding Docker images..." -ForegroundColor Yellow
Invoke-Expression "$DOCKER_COMPOSE_CMD build --no-cache"

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Yellow
Invoke-Expression "$DOCKER_COMPOSE_CMD up -d"

Write-Host ""
Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Checking service status..." -ForegroundColor Yellow
Invoke-Expression "$DOCKER_COMPOSE_CMD ps"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Update Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services have been updated and restarted."
Write-Host ""
Write-Host "To view logs: $DOCKER_COMPOSE_CMD logs -f"
Write-Host "To check status: $DOCKER_COMPOSE_CMD ps"
Write-Host ""

# Show what changed (if git pull happened)
if (Test-Path ".git") {
    Write-Host "Recent changes:" -ForegroundColor Yellow
    git log --oneline -5
    Write-Host ""
}
