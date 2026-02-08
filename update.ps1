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

# Load S3_TYPE from .env (default: none)
$S3_TYPE = "none"
if (Test-Path ".env") {
    $s3Line = Get-Content ".env" | Where-Object { $_ -match '^S3_TYPE=' } | Select-Object -Last 1
    if ($s3Line) {
        $S3_TYPE = $s3Line.Split('=')[1]
    }
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
    # Get current branch and current commit
    $CURRENT_BRANCH = git rev-parse --abbrev-ref HEAD
    $OLD_REV = git rev-parse HEAD
    Write-Host "Current branch: $CURRENT_BRANCH" -ForegroundColor Cyan
    
    # Pull latest changes
    try {
        git pull origin $CURRENT_BRANCH
        $NEW_REV = git rev-parse HEAD
        if ($OLD_REV -eq $NEW_REV) {
            Write-Host "✓ Already up to date. No changes pulled." -ForegroundColor Green
            $CHANGED_FILES = @()
        } else {
            Write-Host "✓ Git pull completed" -ForegroundColor Green
            $CHANGED_FILES = git diff --name-only $OLD_REV $NEW_REV
        }
    } catch {
        Write-Host "ERROR: Failed to pull from git. Please resolve conflicts and try again." -ForegroundColor Red
        exit 1
    }
}

$buildHttp = $false
$buildSmtp = $false
$restartAll = $false
$dbChanged = $false

if ($CHANGED_FILES -and $CHANGED_FILES.Count -gt 0) {
    Write-Host ""
    Write-Host "Changed files:" -ForegroundColor Yellow
    $CHANGED_FILES | ForEach-Object { Write-Host $_ }

    foreach ($file in $CHANGED_FILES) {
        if ($file -like "http-api/*") { $buildHttp = $true }
        if ($file -like "smtp-service/*") { $buildSmtp = $true }
        if ($file -eq "docker-compose.yml") { $restartAll = $true }
        if ($file -like "database/init/*") { $dbChanged = $true }
    }
}

if (-not $CHANGED_FILES -or $CHANGED_FILES.Count -eq 0) {
    Write-Host ""
    Write-Host "No changes detected. Skipping rebuild." -ForegroundColor Green
    exit 0
}

if ($dbChanged) {
    Write-Host ""
    Write-Host "WARNING: Database schema files changed." -ForegroundColor Yellow
    Write-Host "You may need to apply migrations or reinitialize the database." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Stopping existing containers..." -ForegroundColor Yellow
Invoke-Expression "$DOCKER_COMPOSE_CMD down"

if ($buildHttp -or $buildSmtp) {
    Write-Host ""
    Write-Host "Rebuilding Docker images..." -ForegroundColor Yellow
    if ($buildHttp -and $buildSmtp) {
        Invoke-Expression "$DOCKER_COMPOSE_CMD build http-api smtp-service"
    } elseif ($buildHttp) {
        Invoke-Expression "$DOCKER_COMPOSE_CMD build http-api"
    } elseif ($buildSmtp) {
        Invoke-Expression "$DOCKER_COMPOSE_CMD build smtp-service"
    }
} else {
    Write-Host ""
    Write-Host "No service code changes detected. Skipping image rebuild." -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Yellow
if ($S3_TYPE -eq "local") {
    Invoke-Expression "$DOCKER_COMPOSE_CMD --profile s3-local up -d"
} else {
    Invoke-Expression "$DOCKER_COMPOSE_CMD up -d"
}

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
