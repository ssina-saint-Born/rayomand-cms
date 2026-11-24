#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env-file.sh

web_port="${WEB_PORT:-}"
while [ "$#" -gt 0 ]; do
    case "$1" in
        --web-port)
            [ "$#" -ge 2 ] || { echo "--web-port needs a value." >&2; exit 1; }
            web_port="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done
if [ -n "$web_port" ]; then
    case "$web_port" in *[!0-9]*) echo "Web port must be a number from 1 to 65535." >&2; exit 1 ;; esac
    web_port=$((10#$web_port))
    if [ "$web_port" -lt 1 ] || [ "$web_port" -gt 65535 ]; then
        echo "Web port must be a number from 1 to 65535." >&2
        exit 1
    fi
elif [ -f .env ]; then
    web_port=$(env_get WEB_PORT .env)
fi
if [ -f .env ]; then
    database_url=$(env_get DATABASE_URL .env)
    if [ -z "$database_url" ]; then
        database_url=$(legacy_database_url .env postgres)
        if [ -z "$database_url" ]; then
            echo "DATABASE_URL is empty. Set it in .env before starting Docker." >&2
            exit 1
        fi
    fi
    case "$database_url" in
        *replace-with-a-long-random-password*)
            password=$(random_secret)
            database_url="postgresql://rayomand:$password@postgres:5432/rayomand"
            ;;
    esac
else
    password=$(random_secret)
    database_url="postgresql://rayomand:$password@postgres:5432/rayomand"
fi

setup_token=$(env_get SETUP_TOKEN .env)
mail_secret=$(env_get MAIL_SESSION_SECRET .env)
[ -n "$setup_token" ] || setup_token=$(random_secret)
[ -n "$mail_secret" ] || mail_secret=$(random_secret)

entries=("DATABASE_URL=$database_url" "SETUP_TOKEN=$setup_token" "MAIL_SESSION_SECRET=$mail_secret")
[ -z "$web_port" ] || entries+=("WEB_PORT=$web_port")
env_write .env "${entries[@]}"
echo "Configuration ready. Database: one DATABASE_URL; legacy POSTGRES_* entries removed."
echo "Use this private SETUP_TOKEN on the first-run screen to create the owner:"
echo "  $setup_token"
