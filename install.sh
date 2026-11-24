#!/usr/bin/env bash
# Rayomand CMS installer — interactive, non-fatal on soft checks.
#
#   ./install.sh                 run interactively
#   ./install.sh --yes           accept defaults, no prompts (for automation)
#   ./install.sh --uninstall     stop the service and remove the systemd unit
#
# What it does:
#   1. Preflight: Node, PostgreSQL, free ports, write access, outbound port 25
#   2. Creates .env with a random database password and setup token
#   3. Installs dependencies and builds the app
#   4. Creates the database and runs migrations (first request applies schema)
#   5. Writes a systemd unit that runs `npm start` (web + mail under one parent)
#
# It never starts a container and never downloads a database image: PostgreSQL
# must already be installed. This keeps the install inspectable and portable.

set -uo pipefail
cd "$(dirname "$0")"

YES=0
UNINSTALL=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y) YES=1 ;;
        --uninstall) UNINSTALL=1 ;;
        --help|-h) sed -n '2,20p' "$0"; exit 0 ;;
    esac
done

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
ok()   { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}!${RESET} $*"; }
err()  { echo "${RED}✗${RESET} $*"; }
step() { echo; echo "${BOLD}$*${RESET}"; }
ask() { # ask <prompt> <default> -> echoes value
    local prompt="$1" def="${2:-}" reply
    if [ "$YES" = 1 ]; then echo "$def"; return; fi
    read -r -p "$prompt${def:+ [$def]}: " reply </dev/tty || reply=""
    echo "${reply:-$def}"
}

SERVICE_NAME="rayomand"
APP_DIR="$(pwd)"

# ── Uninstall ───────────────────────────────────────────────────────────────
if [ "$UNINSTALL" = 1 ]; then
    step "Removing service"
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl stop "$SERVICE_NAME" 2>/dev/null && ok "stopped" || warn "service was not running"
        sudo systemctl disable "$SERVICE_NAME" 2>/dev/null
        sudo rm -f "/etc/systemd/system/$SERVICE_NAME.service" && ok "unit removed"
        sudo systemctl daemon-reload
    else
        warn "systemctl not found; nothing to remove"
    fi
    warn "The database and .env were left intact. Delete them manually if you want a clean slate."
    exit 0
fi

step "Rayomand CMS installer"

# ── 1. Preflight ────────────────────────────────────────────────────────────
step "1/6  Checking your system"

if ! command -v node >/dev/null 2>&1; then
    err "Node.js is not installed. Install Node 18 or newer, then rerun."
    exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Node.js $NODE_MAJOR is too old; install Node 18+."
    exit 1
fi
ok "Node.js $(node -v)"

if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v)"; else err "npm is missing"; exit 1; fi

# PostgreSQL: prefer psql/pg_isready, but the app only needs a reachable server.
if command -v psql >/dev/null 2>&1; then
    ok "PostgreSQL client $(psql --version | awk '{print $3}')"
else
    warn "psql not found on PATH — the CMS will still work if a server is reachable."
fi

if [ ! -w "$APP_DIR" ]; then err "No write access to $APP_DIR"; exit 1; fi
ok "Write access to $APP_DIR"

# Free ports: the web port and the mail daemon ports must be available unless
# the operator is upgrading in place.
check_port() {
    local p="$1" label="$2"
    if command -v ss >/dev/null 2>&1; then
        if ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN; then warn "Port $p ($label) is already in use."; return 1; fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then warn "Port $p ($label) is already in use."; return 1; fi
    fi
    return 0
}
WEB_PORT=$(ask "Web port" "3131")
check_port "$WEB_PORT" "web" && ok "Port $WEB_PORT is free"
check_port 25 "SMTP inbound" || warn "Port 25 needs to be free for inbound mail; stop any existing MTA (postfix, exim)."

echo
echo "${DIM}Checking outbound port 25 (needed to deliver mail to Gmail/Outlook)…${RESET}"
if command -v timeout >/dev/null 2>&1; then
    if timeout 8 bash -c "cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25" 2>/dev/null; then
        ok "Outbound port 25 is open"
    else
        warn "Outbound port 25 looks blocked. Mail to external providers will fail until your host unblocks it."
        warn "Local mailboxes still receive internal mail. Ask your provider to enable port 25."
    fi
else
    warn "Cannot test port 25 automatically (timeout utility missing)."
fi

# ── 2. Environment ──────────────────────────────────────────────────────────
step "2/6  Creating configuration"

if [ -f .env ]; then
    warn ".env already exists; keeping it. Delete it first to reconfigure from scratch."
else
    DB_NAME=$(ask "Database name" "noma")
    DB_USER=$(ask "Database user" "noma")
    DB_PORT=$(ask "Database port" "5432")
    DB_HOST=$(ask "Database host" "127.0.0.1")
    DB_PASS=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
    SETUP_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    MAIL_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    cat > .env <<EOF
POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_PORT=$DB_PORT
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME
SETUP_TOKEN=$SETUP_TOKEN
MAIL_SESSION_SECRET=$MAIL_SECRET
MAIL_SMTP_PORT=25
MAIL_SUBMISSION_PORT=587
MAIL_SMTPS_PORT=465
MAIL_IMAP_PORT=143
MAIL_IMAPS_PORT=993
MAIL_POP3_PORT=110
MAIL_POP3S_PORT=995
EOF
    chmod 600 .env
    ok ".env created (mode 600)"
    echo
    echo "${BOLD}Your setup token (keep it private):${RESET}"
    echo "  $SETUP_TOKEN"
    echo "${DIM}You will paste this on the first-run screen to create the owner account.${RESET}"
fi

# ── 3. Dependencies + build ─────────────────────────────────────────────────
step "3/6  Installing dependencies"
if npm ci --no-audit --no-fund 2>/dev/null; then
    ok "Dependencies installed (npm ci)"
else
    npm install --no-audit --no-fund || { err "npm install failed"; exit 1; }
    ok "Dependencies installed (npm install)"
fi

step "4/6  Building the application"
if ! npm run build; then err "Build failed. Fix the error above and rerun ./install.sh"; exit 1; fi
ok "Build complete"

# ── 4. Database ─────────────────────────────────────────────────────────────
step "5/6  Preparing the database"
if node scripts/db-preflight.mjs; then
    ok "Database reachable; schema will migrate on first request"
else
    warn "The database is not reachable yet. Start PostgreSQL, then open the site to run migrations."
fi

# ── 5. Service ──────────────────────────────────────────────────────────────
step "6/6  Installing the service"
if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl not found. Start the app with: npm start"
    echo
    echo "${BOLD}Then open http://localhost:$WEB_PORT and paste your setup token.${RESET}"
    exit 0
fi

RUN_USER="${SUDO_USER:-$(id -un)}"
NODE_BIN="$(command -v node)"
# tsx is a JS CLI; invoke it through node so the unit does not depend on a
# shebang or a PATH that includes node_modules/.bin.
TSX_CLI="$APP_DIR/node_modules/tsx/dist/cli.mjs"
if [ ! -f "$TSX_CLI" ]; then
    warn "tsx CLI not found at $TSX_CLI; falling back to 'npm run serve'."
    EXEC_START="/usr/bin/env npm run serve"
else
    EXEC_START="$NODE_BIN $TSX_CLI scripts/serve.ts"
fi
sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null <<EOF
[Unit]
Description=Rayomand CMS (web + mail engine)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$WEB_PORT
# Mail daemon binds privileged ports 25/143/110; grant just those capabilities.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
ExecStart=$EXEC_START
Restart=on-failure
RestartSec=5
# Hardening: the mail daemon must not be able to do more than serve mail.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
sudo systemctl restart "$SERVICE_NAME"
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Service running"
else
    warn "Service did not start; check: sudo journalctl -u $SERVICE_NAME -n 50"
fi

echo
echo "${BOLD}Done.${RESET}"
echo "  Site:        http://localhost:$WEB_PORT"
echo "  Setup:       paste the setup token from .env"
echo "  Logs:        sudo journalctl -u $SERVICE_NAME -f"
echo "  Stop:        sudo systemctl stop $SERVICE_NAME"
echo
echo "${DIM}Next: add your domain under Studio → Mail so the CMS can send email,${RESET}"
echo "${DIM}and point the MX/SPF/DKIM records as shown in that screen.${RESET}"
