#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Astro FITS Cataloger — Interactive Setup Script
#
# Guides you through deploying the two-host Docker stack:
#   Host A  (this machine or remote): Postgres, Redis, FastAPI, Celery Worker
#   Host B  (this machine or remote): Nginx serving the SolidJS frontend
#
# Run:  bash setup.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

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
    local prompt="$1" default="$2" var="$3"
    if [ -n "$default" ]; then
        read -rp "$(echo -e "${CYAN}?${NC}  ${prompt} [${default}]: ")" value
        eval "$var=\"${value:-$default}\""
    else
        read -rp "$(echo -e "${CYAN}?${NC}  ${prompt}: ")" value
        eval "$var=\"$value\""
    fi
}

ask_yes_no() {
    local prompt="$1" default="${2:-y}"
    local yn
    read -rp "$(echo -e "${CYAN}?${NC}  ${prompt} [${default}]: ")" yn
    yn="${yn:-$default}"
    [[ "$yn" =~ ^[Yy] ]]
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
header "Pre-flight Checks"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
info "Working directory: $SCRIPT_DIR"

if ! command -v docker &>/dev/null; then
    error "Docker is not installed. Please install Docker first."
    echo "  https://docs.docker.com/get-docker/"
    exit 1
fi
success "Docker found: $(docker --version)"

if ! docker compose version &>/dev/null; then
    error "Docker Compose (v2) is not available."
    echo "  Ensure you have 'docker compose' (not the old docker-compose)."
    exit 1
fi
success "Docker Compose found: $(docker compose version --short)"

if ! docker info &>/dev/null 2>&1; then
    error "Docker daemon is not running. Please start Docker and try again."
    exit 1
fi
success "Docker daemon is running"

# ── Choose what to set up ────────────────────────────────────────────────────
header "Deployment Mode"

echo "This application uses a two-host architecture:"
echo ""
echo "  Host A — Postgres, Redis, FastAPI API server, Celery worker"
echo "           Handles all data storage and FITS processing"
echo ""
echo "  Host B — Nginx serving the compiled SolidJS frontend"
echo "           A lightweight static file server"
echo ""
echo "Both can run on the same machine, or on separate hosts."
echo ""

SETUP_BACKEND=false
SETUP_FRONTEND=false

echo "What would you like to set up?"
echo "  1) Host A only   (backend + database + worker)"
echo "  2) Host B only   (frontend)"
echo "  3) Both on this machine"
echo ""
read -rp "$(echo -e "${CYAN}?${NC}  Choose [1/2/3]: ")" DEPLOY_CHOICE

case "$DEPLOY_CHOICE" in
    1) SETUP_BACKEND=true ;;
    2) SETUP_FRONTEND=true ;;
    3) SETUP_BACKEND=true; SETUP_FRONTEND=true ;;
    *)
        error "Invalid choice. Please run the script again."
        exit 1
        ;;
esac

# ── Detect this machine's LAN IP ────────────────────────────────────────────
detect_lan_ip() {
    # Try common methods to find a non-loopback IPv4 address
    local ip=""
    if command -v ip &>/dev/null; then
        ip=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[\d.]+' || true)
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

# ══════════════════════════════════════════════════════════════════════════════
#   HOST A — Backend Setup
# ══════════════════════════════════════════════════════════════════════════════
if [ "$SETUP_BACKEND" = true ]; then

    header "Host A — Database Configuration"

    ask "PostgreSQL username"  "astro"         PG_USER
    ask "PostgreSQL password"  "astro"         PG_PASS
    ask "PostgreSQL database"  "astro_catalog" PG_DB

    header "Host A — FITS Data Location"

    echo "The worker needs read access to your FITS image files."
    echo "Provide the absolute path on this machine to the root of your FITS library."
    echo ""
    echo "Example:  /mnt/astro-data/fits"
    echo "          /home/user/astrophotography"
    echo "          D:/AstroImages (on Windows via Docker Desktop)"
    echo ""
    ask "Path to FITS files on this host" "" FITS_PATH

    while [ ! -d "$FITS_PATH" ]; do
        warn "Directory '$FITS_PATH' does not exist."
        if ask_yes_no "Create it?" "n"; then
            mkdir -p "$FITS_PATH"
            success "Created $FITS_PATH"
        else
            ask "Path to FITS files on this host" "" FITS_PATH
        fi
    done

    FITS_COUNT=$(find "$FITS_PATH" -maxdepth 3 -type f \( -iname '*.fits' -o -iname '*.fit' -o -iname '*.fts' \) 2>/dev/null | head -100 | wc -l)
    if [ "$FITS_COUNT" -gt 0 ]; then
        success "Found FITS files in $FITS_PATH (at least $FITS_COUNT)"
    else
        warn "No FITS files found in '$FITS_PATH' (searched 3 levels deep)."
        info "You can add files later; the scanner will pick them up."
    fi

    header "Host A — Network Configuration"

    info "Detected LAN IP: $HOST_IP"
    ask "IP address of this Host A machine (for CORS / frontend access)" "$HOST_IP" BACKEND_IP
    ask "API port" "8000" API_PORT

    BACKEND_URL="http://${BACKEND_IP}:${API_PORT}"
    info "API will be accessible at: ${BACKEND_URL}"

    header "Host A — Frontend Host (for CORS)"

    echo "Where will the frontend (Host B) run?"
    echo "If both are on this machine, use the same IP."
    echo ""
    ask "Frontend host IP" "$BACKEND_IP" FRONTEND_IP
    ask "Frontend port"    "3000"        FRONTEND_PORT

    CORS_ORIGIN="http://${FRONTEND_IP}:${FRONTEND_PORT}"
    info "CORS will allow: ${CORS_ORIGIN}"

    header "Host A — Worker Configuration"

    echo "The Celery worker processes FITS files in parallel."
    echo "More workers = faster ingestion, but uses more CPU/RAM."
    echo ""
    ask "Worker concurrency (parallel tasks)" "4" WORKER_CONCURRENCY
    ask "Thumbnail max width (px)"            "800" THUMB_WIDTH

    # ── Generate .env file ───────────────────────────────────────────────────
    header "Host A — Writing Configuration"

    ENV_FILE="$SCRIPT_DIR/.env"

    cat > "$ENV_FILE" <<EOF
# ──────────────────────────────────────────────────────────────
# Astro FITS Cataloger — Host A Environment
# Generated by setup.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ──────────────────────────────────────────────────────────────

# PostgreSQL
POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=${PG_DB}

# Application
ASTRO_DATABASE_URL=postgresql+asyncpg://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}
ASTRO_REDIS_URL=redis://redis:6379/0
ASTRO_CORS_ORIGINS=["${CORS_ORIGIN}"]
ASTRO_FITS_DATA_PATH=/app/data/fits
ASTRO_THUMBNAILS_PATH=/app/data/thumbnails
ASTRO_THUMBNAIL_MAX_WIDTH=${THUMB_WIDTH}

# Host paths (mapped into containers)
FITS_DATA_HOST_PATH=${FITS_PATH}
EOF

    success "Created $ENV_FILE"

    # ── Patch docker-compose worker concurrency ──────────────────────────────
    if [ "$WORKER_CONCURRENCY" != "4" ]; then
        sed -i "s/--concurrency=4/--concurrency=${WORKER_CONCURRENCY}/" "$SCRIPT_DIR/docker-compose.yml"
        success "Set worker concurrency to $WORKER_CONCURRENCY"
    fi

    # ── Update docker-compose env vars to use .env credentials ───────────────
    # The docker-compose.yml has hardcoded astro:astro — update if user changed them
    if [ "$PG_USER" != "astro" ] || [ "$PG_PASS" != "astro" ] || [ "$PG_DB" != "astro_catalog" ]; then
        DB_URL="postgresql+asyncpg://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}"
        sed -i "s|postgresql+asyncpg://astro:astro@postgres:5432/astro_catalog|${DB_URL}|g" "$SCRIPT_DIR/docker-compose.yml"
        success "Updated database connection strings in docker-compose.yml"
    fi

    # ── Build and start ──────────────────────────────────────────────────────
    header "Host A — Building Containers"

    info "Building backend Docker images (this may take a few minutes on first run)..."
    docker compose build api worker

    success "Build complete!"

    header "Host A — Starting Services"

    info "Starting PostgreSQL and Redis..."
    docker compose up -d postgres redis

    echo -n "  Waiting for PostgreSQL"
    for i in $(seq 1 30); do
        if docker compose exec -T postgres pg_isready -U "$PG_USER" &>/dev/null; then
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    if docker compose exec -T postgres pg_isready -U "$PG_USER" &>/dev/null; then
        success "PostgreSQL is ready"
    else
        error "PostgreSQL failed to start within 30 seconds."
        echo "  Check logs: docker compose logs postgres"
        exit 1
    fi

    if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        success "Redis is ready"
    else
        error "Redis failed to start."
        echo "  Check logs: docker compose logs redis"
        exit 1
    fi

    # ── Run Alembic migrations ───────────────────────────────────────────────
    header "Host A — Database Migrations"

    info "Generating and running database migrations..."

    # Generate initial migration inside the API container
    docker compose run --rm -T api bash -c "
        cd /app && \
        alembic revision --autogenerate -m 'initial schema: targets and images' 2>&1 && \
        alembic upgrade head 2>&1
    "

    if [ $? -eq 0 ]; then
        success "Database schema created successfully"
    else
        warn "Migration had issues. You may need to run manually:"
        echo "  docker compose exec api alembic upgrade head"
    fi

    # ── Start API and Worker ─────────────────────────────────────────────────
    header "Host A — Starting Application"

    info "Starting API server and Celery worker..."
    docker compose up -d api worker

    echo -n "  Waiting for API"
    for i in $(seq 1 20); do
        if curl -sf "http://localhost:${API_PORT}/api/scan/status" &>/dev/null; then
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""

    if curl -sf "http://localhost:${API_PORT}/api/scan/status" &>/dev/null; then
        success "API is responding at http://localhost:${API_PORT}"
    else
        warn "API not responding yet. It may still be starting up."
        echo "  Check logs: docker compose logs api"
    fi

    # ── Verify worker ────────────────────────────────────────────────────────
    WORKER_STATUS=$(docker compose ps worker --format '{{.Status}}' 2>/dev/null || true)
    if echo "$WORKER_STATUS" | grep -qi "up"; then
        success "Celery worker is running (concurrency=$WORKER_CONCURRENCY)"
    else
        warn "Worker may still be starting."
        echo "  Check logs: docker compose logs worker"
    fi

    # ── Summary ──────────────────────────────────────────────────────────────
    header "Host A — Setup Complete!"

    echo -e "  ${BOLD}Services running:${NC}"
    echo "    PostgreSQL ......... localhost:5432"
    echo "    Redis .............. localhost:6379"
    echo "    FastAPI ............ http://localhost:${API_PORT}"
    echo "    Celery Worker ...... ${WORKER_CONCURRENCY} processes"
    echo ""
    echo -e "  ${BOLD}FITS data:${NC}     $FITS_PATH"
    echo -e "  ${BOLD}API docs:${NC}      http://localhost:${API_PORT}/docs"
    echo -e "  ${BOLD}CORS origin:${NC}   $CORS_ORIGIN"
    echo ""
    echo -e "  ${BOLD}Useful commands:${NC}"
    echo "    docker compose logs -f api        # API logs"
    echo "    docker compose logs -f worker     # Worker logs"
    echo "    docker compose ps                 # Service status"
    echo "    docker compose down               # Stop all services"
    echo "    docker compose exec api alembic upgrade head  # Run migrations"
    echo ""

    if ask_yes_no "Trigger an initial scan of your FITS directory now?" "y"; then
        info "Scanning $FITS_PATH for FITS files..."
        SCAN_RESULT=$(curl -sf -X POST "http://localhost:${API_PORT}/api/scan" 2>/dev/null || true)
        if [ -n "$SCAN_RESULT" ]; then
            NEW_FILES=$(echo "$SCAN_RESULT" | grep -oP '"new_files_queued":\s*\K\d+' || echo "0")
            success "Scan complete! Queued $NEW_FILES files for processing."
            if [ "$NEW_FILES" -gt 0 ]; then
                info "The worker is now ingesting files in the background."
                echo "  Watch progress: docker compose logs -f worker"
            fi
        else
            warn "Could not trigger scan. The API may still be starting."
            echo "  Try manually: curl -X POST http://localhost:${API_PORT}/api/scan"
        fi
    fi

fi  # end SETUP_BACKEND


# ══════════════════════════════════════════════════════════════════════════════
#   HOST B — Frontend Setup
# ══════════════════════════════════════════════════════════════════════════════
if [ "$SETUP_FRONTEND" = true ]; then

    header "Host B — Frontend Configuration"

    if [ "$SETUP_BACKEND" = true ]; then
        # Both on same machine — reuse values
        info "Using backend URL from Host A setup: ${BACKEND_URL}/api"
        API_URL="${BACKEND_URL}/api"
    else
        echo "The frontend needs to know where the Host A API is running."
        echo ""
        echo "Example:  http://192.168.1.50:8000/api"
        echo "          http://mini-pc.local:8000/api"
        echo ""
        ask "Full URL to the Host A API" "http://${HOST_IP}:8000/api" API_URL
    fi

    ask "Frontend port on this machine" "3000" FE_PORT

    header "Host B — Building Frontend"

    info "Building frontend with API URL: $API_URL"
    info "This compiles the SolidJS app and packages it with Nginx..."

    API_URL="$API_URL" docker compose -f docker-compose.frontend.yml build \
        --build-arg "VITE_API_URL=$API_URL"

    success "Frontend build complete!"

    header "Host B — Starting Frontend"

    # Update port in docker-compose.frontend.yml if non-default
    if [ "$FE_PORT" != "3000" ]; then
        sed -i "s/\"3000:80\"/\"${FE_PORT}:80\"/" "$SCRIPT_DIR/docker-compose.frontend.yml"
    fi

    docker compose -f docker-compose.frontend.yml up -d

    echo -n "  Waiting for Nginx"
    for i in $(seq 1 15); do
        if curl -sf "http://localhost:${FE_PORT}/" &>/dev/null; then
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    if curl -sf "http://localhost:${FE_PORT}/" &>/dev/null; then
        success "Frontend is serving at http://localhost:${FE_PORT}"
    else
        warn "Frontend not responding yet. Check: docker compose -f docker-compose.frontend.yml logs"
    fi

    header "Host B — Setup Complete!"

    echo -e "  ${BOLD}Frontend:${NC}  http://localhost:${FE_PORT}"
    echo -e "  ${BOLD}API URL:${NC}   $API_URL"
    echo ""
    echo -e "  ${BOLD}Useful commands:${NC}"
    echo "    docker compose -f docker-compose.frontend.yml logs -f    # Logs"
    echo "    docker compose -f docker-compose.frontend.yml down       # Stop"
    echo "    docker compose -f docker-compose.frontend.yml up -d      # Restart"
    echo ""

    # Verify API connectivity from frontend's perspective
    API_BASE="${API_URL%/api}"
    if curl -sf "${API_URL}/scan/status" &>/dev/null; then
        success "Frontend can reach the API at $API_URL"
    else
        warn "Cannot reach API at $API_URL from this machine."
        echo "  Make sure Host A is running and the firewall allows port ${API_URL##*:}"
        echo "  The frontend will still load, but won't show data until the API is reachable."
    fi

fi  # end SETUP_FRONTEND


# ══════════════════════════════════════════════════════════════════════════════
#   Final Summary
# ══════════════════════════════════════════════════════════════════════════════
header "All Done!"

if [ "$SETUP_BACKEND" = true ] && [ "$SETUP_FRONTEND" = true ]; then
    echo -e "  Open your browser to: ${BOLD}http://localhost:${FE_PORT:-3000}${NC}"
    echo ""
    echo "  The full stack is running:"
    echo "    Backend API .... http://localhost:${API_PORT:-8000}/docs"
    echo "    Frontend UI .... http://localhost:${FE_PORT:-3000}"
    echo ""
elif [ "$SETUP_BACKEND" = true ]; then
    echo "  Host A is ready. Now run this script on Host B to set up the frontend,"
    echo "  or run it again here and choose option 2."
    echo ""
    echo "  The frontend will need this API URL: ${BOLD}${BACKEND_URL}/api${NC}"
    echo ""
elif [ "$SETUP_FRONTEND" = true ]; then
    echo "  Host B is ready and serving the frontend."
    echo "  Make sure Host A is running at: ${BOLD}${API_URL}${NC}"
    echo ""
fi

echo "  To tear everything down:"
echo "    docker compose down -v                                    # Host A"
echo "    docker compose -f docker-compose.frontend.yml down        # Host B"
echo ""
