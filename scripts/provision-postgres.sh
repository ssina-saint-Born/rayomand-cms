#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env-file.sh

if [ -n "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is already set; leaving PostgreSQL unchanged."
    exit 0
fi
configured_url=$(env_get DATABASE_URL .env)
case "$configured_url" in *replace-with-a-long-random-password*) configured_url="" ;; esac
if [ -n "$configured_url" ]; then
    echo "DATABASE_URL already exists; leaving the database unchanged."
    exit 0
fi

SUDO=()
if [ "$(id -u)" -ne 0 ]; then
    if ! command -v sudo >/dev/null 2>&1; then
        echo "Run as root or install sudo to provision PostgreSQL." >&2
        exit 1
    fi
    SUDO=(sudo)
fi

postgres_psql() {
    run_as_postgres psql "$@"
}

run_as_postgres() {
    if [ "$(id -u)" -eq 0 ]; then
        if command -v runuser >/dev/null 2>&1; then
            runuser -u postgres -- "$@"
        elif command -v su-exec >/dev/null 2>&1; then
            su-exec postgres "$@"
        else
            su -s /bin/sh postgres -c '"$@"' sh "$@"
        fi
    else
        sudo -u postgres "$@"
    fi
}

if command -v apt-get >/dev/null 2>&1; then
    "${SUDO[@]}" apt-get update
    "${SUDO[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
    "${SUDO[@]}" systemctl enable --now postgresql
elif command -v dnf >/dev/null 2>&1; then
    "${SUDO[@]}" dnf install -y postgresql-server postgresql-contrib
    if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then "${SUDO[@]}" postgresql-setup --initdb; fi
    "${SUDO[@]}" systemctl enable --now postgresql
elif command -v yum >/dev/null 2>&1; then
    "${SUDO[@]}" yum install -y postgresql-server postgresql-contrib
    if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then "${SUDO[@]}" postgresql-setup --initdb; fi
    "${SUDO[@]}" systemctl enable --now postgresql
elif command -v apk >/dev/null 2>&1; then
    "${SUDO[@]}" apk add --no-cache postgresql postgresql-contrib su-exec
    if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then run_as_postgres initdb -D /var/lib/postgresql/data; fi
    "${SUDO[@]}" rc-update add postgresql default
    "${SUDO[@]}" rc-service postgresql start
else
    echo "Supported package managers: apt, dnf, yum, apk. Install PostgreSQL 14+ manually and set DATABASE_URL." >&2
    exit 1
fi

for attempt in $(seq 1 30); do
    if postgres_psql -tAc "SELECT 1" >/dev/null 2>&1; then break; fi
    [ "$attempt" -lt 30 ] || { echo "PostgreSQL did not become ready." >&2; exit 1; }
    sleep 1
done

database_port=$(postgres_psql -tAc "SHOW port")
database_version=$(postgres_psql -tAc "SHOW server_version")
database_major=${database_version%%.*}
if [ "$database_major" -lt 14 ]; then
    echo "PostgreSQL 14 or newer is required; installed server is $database_version." >&2
    echo "Upgrade PostgreSQL, then rerun this script." >&2
    exit 1
fi
password=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
postgres_psql -v ON_ERROR_STOP=1 <<SQL
\set db_user 'rayomand'
\set db_password '$password'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', 'rayomand', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rayomand')
\gexec
SQL

setup_token=$(env_get SETUP_TOKEN .env)
mail_secret=$(env_get MAIL_SESSION_SECRET .env)
[ -n "$setup_token" ] || setup_token=$(random_secret)
[ -n "$mail_secret" ] || mail_secret=$(random_secret)
env_write .env \
    "DATABASE_URL=postgresql://rayomand:$password@127.0.0.1:$database_port/rayomand" \
    "SETUP_TOKEN=$setup_token" \
    "MAIL_SESSION_SECRET=$mail_secret"
echo "PostgreSQL $database_version is ready. DATABASE_URL was written to .env automatically."
