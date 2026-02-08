#!/bin/bash

set -e

echo "=========================================="
echo "Open Inbound Update Script"
echo "=========================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."
echo ""

# Check for Docker
if ! command_exists docker; then
    echo "ERROR: Docker is not installed."
    exit 1
fi

# Check for Docker Compose (try both 'docker-compose' and 'docker compose')
DOCKER_COMPOSE_CMD=""
if command_exists docker-compose; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    echo "ERROR: Docker Compose is not installed."
    exit 1
fi

# Check for Git
if ! command_exists git; then
    echo "ERROR: Git is not installed."
    exit 1
fi

echo "✓ All prerequisites met"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "WARNING: .env file not found!"
    echo "The update script will preserve your configuration, but no .env file was found."
    echo "If this is a fresh installation, run install.sh instead."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Update cancelled."
        exit 1
    fi
else
    echo "✓ Configuration file (.env) found"
fi

# Load S3_TYPE from .env (default: none)
S3_TYPE=$(grep -E '^S3_TYPE=' .env | tail -n1 | cut -d= -f2)
if [ -z "$S3_TYPE" ]; then
    S3_TYPE="none"
fi

# Backup .env file
if [ -f ".env" ]; then
    echo "Backing up .env file..."
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ Backup created"
fi

echo ""
echo "Pulling latest changes from Git..."
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "WARNING: Not a git repository. Skipping git pull."
    echo "If you cloned without .git, you may need to re-clone the repository."
    read -p "Continue with Docker rebuild? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Update cancelled."
        exit 1
    fi
else
    # Get current branch and current commit
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    OLD_REV=$(git rev-parse HEAD)
    echo "Current branch: $CURRENT_BRANCH"
    
    # Pull latest changes
    git pull origin "$CURRENT_BRANCH" || {
        echo "ERROR: Failed to pull from git. Please resolve conflicts and try again."
        exit 1
    }
    NEW_REV=$(git rev-parse HEAD)

    if [ "$OLD_REV" = "$NEW_REV" ]; then
        echo "✓ Already up to date. No changes pulled."
        CHANGED_FILES=""
    else
        echo "✓ Git pull completed"
        CHANGED_FILES=$(git diff --name-only "$OLD_REV" "$NEW_REV")
    fi
fi

build_http=false
build_smtp=false
restart_all=false
db_changed=false

if [ -n "$CHANGED_FILES" ]; then
    echo ""
    echo "Changed files:"
    echo "$CHANGED_FILES"

    for file in $CHANGED_FILES; do
        case "$file" in
            http-api/*) build_http=true ;;
            smtp-service/*) build_smtp=true ;;
            docker-compose.yml) restart_all=true ;;
            database/init/*) db_changed=true ;;
        esac
    done
fi

if [ -z "$CHANGED_FILES" ]; then
    echo ""
    echo "No changes detected. Skipping rebuild."
    exit 0
fi

if [ "$db_changed" = true ]; then
    echo ""
    echo "WARNING: Database schema files changed."
    echo "You may need to apply migrations or reinitialize the database."
fi

echo ""
echo "Stopping existing containers..."
$DOCKER_COMPOSE_CMD down

if [ "$build_http" = true ] || [ "$build_smtp" = true ]; then
    echo ""
    echo "Rebuilding Docker images..."
    if [ "$build_http" = true ] && [ "$build_smtp" = true ]; then
        $DOCKER_COMPOSE_CMD build http-api smtp-service
    elif [ "$build_http" = true ]; then
        $DOCKER_COMPOSE_CMD build http-api
    elif [ "$build_smtp" = true ]; then
        $DOCKER_COMPOSE_CMD build smtp-service
    fi
else
    echo ""
    echo "No service code changes detected. Skipping image rebuild."
fi

echo ""
echo "Starting services..."
if [ "$S3_TYPE" = "local" ]; then
    $DOCKER_COMPOSE_CMD --profile s3-local up -d
else
    $DOCKER_COMPOSE_CMD up -d
fi

echo ""
echo "Waiting for services to start..."
sleep 5

echo ""
echo "Checking service status..."
$DOCKER_COMPOSE_CMD ps

echo ""
echo "=========================================="
echo "Update Complete!"
echo "=========================================="
echo ""
echo "Services have been updated and restarted."
echo ""
echo "To view logs: $DOCKER_COMPOSE_CMD logs -f"
echo "To check status: $DOCKER_COMPOSE_CMD ps"
echo ""

# Show what changed (if git pull happened)
if [ -d ".git" ]; then
    echo "Recent changes:"
    git log --oneline -5 || echo "Could not retrieve git log"
    echo ""
fi
