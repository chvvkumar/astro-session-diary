#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Astro FITS Cataloger — Interactive Setup Script
#
# Guides you through deploying the single-container Docker stack:
#   PostgreSQL, Redis, FastAPI + SolidJS frontend, Celery Worker
#   all managed by supervisord inside one "app" container.
#
# Run:  bash setup.sh
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail
# NOTE: We do NOT use `set -e` globally. Commands that are allowed to fail use
# explicit `|| true` guards, and critical commands check $? manually. This
# avoids silent exits mid-script that confuse the user.

# ── Colors & helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✖${NC}  $*"; }
header()  { echo -e "\n${BOLD}━━━ $* ━━━${NC}\n"; }

ask() {
    local prompt="$1"
    local default="${2:-}"
    local var="$3"
    local value=""
    if [ -n "$default" ]; then
        read -rp "$(echo -e "${CYAN}?${NC}  ${prompt} [${default}]: ")" value
        value="${value:-$default}"
    else
        read -rp "$(echo -e "${CYAN}?${NC}  ${prompt}: ")" value
    fi
    eval "$var=\"\$value\""
}

ask_yes_no() {
    local prompt="$1"
    local default="${2:-y}"
    local yn=""
    read -rp "$(echo -e "${CYAN}?${NC}  ${prompt} [${default}]: ")" yn
    yn="${yn:-$default}"
    [[ "$yn" =~ ^[Yy] ]]
}

die() {
    error "$@"
    exit 1
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
header "Pre-flight Checks"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
info "Working directory: $SCRIPT_DIR"

command -v docker &>/dev/null || die "Docker is not installed. See https://docs.docker.com/get-docker/"
success "Docker found: $(docker --version)"

docker compose version &>/dev/null || die "Docker Compose v2 not available. Ensure 'docker compose' works."
success "Docker Compose found: $(docker compose version --short)"

docker info &>/dev/null 2>&1 || die "Docker daemon is not running. Please start Docker and try again."
success "Docker daemon is running"

# ── Detect this machine's LAN IP ────────────────────────────────────────────
detect_lan_ip() {
    local ip=""
    if command -v ip &>/dev/null; then
        ip=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p' || true)
    fi
    if [ -z "$ip" ] && command -v hostname &>/dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    fi
    if [ -z "$ip" ] && command -v ifconfig &>/dev/null; then
        ip=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' || true)
    fi
    echo "${ip:-localhost}"
}

HOST_IP=$(detect_lan_ip)

# ── Database Configuration ───────────────────────────────────────────────────
header "Database Configuration"

ask "PostgreSQL username"  "astro"         PG_USER
ask "PostgreSQL password"  "astro"         PG_PASS
ask "PostgreSQL database"  "astro_catalog" PG_DB

# ── Data Storage Locations ───────────────────────────────────────────────────
header "Data Storage Locations"

echo "The application needs three data directories:"
echo ""
echo "  1. FITS files     — your astrophotography images (read-only)"
echo "  2. Thumbnails     — generated JPEG previews"
echo "  3. Database       — PostgreSQL data files"
echo ""

# Helper to ask for a directory path and optionally create it
ask_directory() {
    local prompt="$1"
    local default="$2"
    local var="$3"
    local result=""

    while true; do
        ask "$prompt" "$default" result

        if [ -z "$result" ]; then
            warn "Path cannot be empty."
            continue
        fi

        if [ -d "$result" ]; then
            break
        fi

        warn "Directory '$result' does not exist."
        if ask_yes_no "Create it?" "y"; then
            mkdir -p "$result" || { error "Failed to create directory."; continue; }
            success "Created $result"
            break
        fi
    done

    eval "$var=\"\$result\""
}

if ask_yes_no "Store all data under one parent folder?" "y"; then
    echo ""
    echo "Example:  /docker/astro_cataloger"
    echo "          /data/astro"
    echo ""
    ask_directory "Parent data folder" "/docker/astro_cataloger" DATA_ROOT

    FITS_PATH=""
    THUMBNAILS_PATH="${DATA_ROOT}/thumbnails"
    PG_DATA_PATH="${DATA_ROOT}/postgres"

    echo ""
    echo "FITS files are read-only — they are typically on a separate drive or NAS."
    echo ""
    if ask_yes_no "Are your FITS files already somewhere else (not under ${DATA_ROOT})?" "y"; then
        ask_directory "Path to FITS files" "" FITS_PATH
    else
        FITS_PATH="${DATA_ROOT}/fits"
    fi

    # Create subdirectories
    mkdir -p "$THUMBNAILS_PATH" 2>/dev/null || true
    mkdir -p "$PG_DATA_PATH" 2>/dev/null || true
    if [ -n "$FITS_PATH" ] && [ ! -d "$FITS_PATH" ]; then
        mkdir -p "$FITS_PATH" 2>/dev/null || true
    fi

    success "Data root: $DATA_ROOT"

else
    echo ""
    echo "Configure each path individually."
    echo ""

    # FITS files
    echo "Your FITS image library (read-only access):"
    ask_directory "Path to FITS files" "" FITS_PATH

    # Thumbnails
    echo ""
    echo "Generated JPEG thumbnails (will grow as files are ingested):"
    ask_directory "Thumbnails storage path" "" THUMBNAILS_PATH

    # PostgreSQL
    echo ""
    echo "PostgreSQL database files:"
    ask_directory "Database storage path" "" PG_DATA_PATH
fi

echo ""
success "FITS files:     $FITS_PATH"
success "Thumbnails:     $THUMBNAILS_PATH"
success "Database:       $PG_DATA_PATH"

# Quick FITS file check (safe — never kills the script)
FITS_COUNT=$(find "$FITS_PATH" -type f \( -iname '*.fits' -o -iname '*.fit' -o -iname '*.fts' \) 2>/dev/null | head -100 | wc -l || echo "0")
if [ "$FITS_COUNT" -gt 0 ] 2>/dev/null; then
    if [ "$FITS_COUNT" -ge 100 ]; then
        success "Found 100+ FITS files in $FITS_PATH"
    else
        success "Found $FITS_COUNT FITS file(s) in $FITS_PATH"
    fi
else
    warn "No FITS files found in '$FITS_PATH'."
    info "You can add files later; the scanner will pick them up."
fi

# ── Network Configuration ────────────────────────────────────────────────────
header "Network Configuration"

ask "Application port" "8080" APP_PORT

info "Application will be accessible at: http://localhost:${APP_PORT}"

# ── Worker Configuration ─────────────────────────────────────────────────────
header "Worker Configuration"

echo "The Celery worker processes FITS files in parallel."
echo "More workers = faster ingestion, but uses more CPU/RAM."
echo ""
ask "Worker concurrency (parallel tasks)" "4" WORKER_CONCURRENCY
ask "Thumbnail max width (px)"            "800" THUMB_WIDTH

# ── Generate .env file ───────────────────────────────────────────────────────
header "Writing Configuration"

ENV_FILE="$SCRIPT_DIR/.env"

cat > "$ENV_FILE" <<ENVEOF
# ──────────────────────────────────────────────────────────────
# Astro FITS Cataloger — Environment
# Generated by setup.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ──────────────────────────────────────────────────────────────

# PostgreSQL
POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=${PG_DB}

# Application
ASTRO_DATABASE_URL=postgresql+asyncpg://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}
ASTRO_REDIS_URL=redis://redis:6379/0
ASTRO_FITS_DATA_PATH=/app/data/fits
ASTRO_THUMBNAILS_PATH=/app/data/thumbnails
ASTRO_THUMBNAIL_MAX_WIDTH=${THUMB_WIDTH}

# Host paths (mapped into containers)
FITS_DATA_HOST_PATH=${FITS_PATH}
THUMBNAILS_HOST_PATH=${THUMBNAILS_PATH}
POSTGRES_DATA_HOST_PATH=${PG_DATA_PATH}
ENVEOF

success "Created $ENV_FILE"

# ── Patch supervisord worker concurrency ─────────────────────────────────────
if [ "$WORKER_CONCURRENCY" != "4" ]; then
    sed -i "s/--concurrency=4/--concurrency=${WORKER_CONCURRENCY}/" "$SCRIPT_DIR/supervisord.conf"
    success "Set worker concurrency to $WORKER_CONCURRENCY"
fi

# ── Build ─────────────────────────────────────────────────────────────────────
header "Building Container"

info "Building app Docker image (this may take a few minutes on first run)..."
if ! docker compose build app; then
    die "Docker build failed. Check the output above for errors."
fi

success "Build complete!"

# ── Start services ────────────────────────────────────────────────────────────
header "Starting Services"

info "Starting PostgreSQL and Redis..."
docker compose up -d postgres redis

echo -n "  Waiting for PostgreSQL"
PG_READY=false
for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U "$PG_USER" &>/dev/null; then
        PG_READY=true
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ "$PG_READY" = true ]; then
    success "PostgreSQL is ready"
else
    die "PostgreSQL failed to start within 30 seconds.\n  Check logs: docker compose logs postgres"
fi

REDIS_PONG=$(docker compose exec -T redis redis-cli ping 2>/dev/null || true)
if echo "$REDIS_PONG" | grep -q "PONG" 2>/dev/null; then
    success "Redis is ready"
else
    die "Redis failed to start.\n  Check logs: docker compose logs redis"
fi

# ── Run Alembic migrations ───────────────────────────────────────────────────
header "Database Migrations"

info "Generating and running database migrations..."

if docker compose run --rm -T app bash -c \
    "cd /app && alembic revision --autogenerate -m 'initial schema: targets and images' 2>&1 && alembic upgrade head 2>&1"; then
    success "Database schema created successfully"
else
    warn "Migration had issues. You may need to run manually:"
    echo "  docker compose run --rm app alembic revision --autogenerate -m 'initial'"
    echo "  docker compose run --rm app alembic upgrade head"
fi

# ── Start Application ────────────────────────────────────────────────────────
header "Starting Application"

info "Starting application container..."
docker compose up -d app

echo -n "  Waiting for application"
APP_READY=false
for i in $(seq 1 20); do
    if curl -sf "http://localhost:${APP_PORT}/api/scan/status" &>/dev/null; then
        APP_READY=true
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

if [ "$APP_READY" = true ]; then
    success "Application is responding at http://localhost:${APP_PORT}"
else
    warn "Application not responding yet. It may still be starting up."
    echo "  Check logs: docker compose logs app"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
header "Setup Complete!"

echo -e "  ${BOLD}Services running:${NC}"
echo "    Application ........ http://localhost:${APP_PORT}"
echo "    PostgreSQL ......... localhost:5432"
echo "    Redis .............. localhost:6379"
echo ""
echo -e "  ${BOLD}Data locations:${NC}"
echo "    FITS files ......... $FITS_PATH"
echo "    Thumbnails ......... $THUMBNAILS_PATH"
echo "    Database ........... $PG_DATA_PATH"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo "    docker compose logs -f app    # App logs"
echo "    docker compose ps             # Status"
echo "    docker compose down           # Stop"
echo ""

# ── Initial scan ─────────────────────────────────────────────────────────────
if ask_yes_no "Trigger an initial scan of your FITS directory now?" "y"; then
    info "Scanning $FITS_PATH for FITS files..."
    SCAN_RESULT=$(curl -sf -X POST "http://localhost:${APP_PORT}/api/scan" 2>/dev/null || true)
    if [ -n "$SCAN_RESULT" ]; then
        # Extract new_files_queued — works with grep -o (no PCRE needed)
        NEW_FILES=$(echo "$SCAN_RESULT" | sed -n 's/.*"new_files_queued"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' || echo "0")
        NEW_FILES="${NEW_FILES:-0}"
        success "Scan complete! Queued $NEW_FILES files for processing."
        if [ "$NEW_FILES" -gt 0 ] 2>/dev/null; then
            info "The worker is now ingesting files in the background."
            echo "  Watch progress: docker compose logs -f app"
        fi
    else
        warn "Could not trigger scan. The application may still be starting."
        echo "  Try manually: curl -X POST http://localhost:${APP_PORT}/api/scan"
    fi
fi

# ── Final ─────────────────────────────────────────────────────────────────────
header "All Done!"

echo -e "  Open your browser to: ${BOLD}http://localhost:${APP_PORT}${NC}"
echo ""
echo "  To tear everything down:"
echo "    docker compose down -v"
echo ""
