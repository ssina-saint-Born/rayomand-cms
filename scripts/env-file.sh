#!/usr/bin/env bash

env_get() {
    local key="$1" file="${2:-.env}" line value
    [ -f "$file" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        case "$line" in
            "$key="*)
                value="${line#*=}"
                if [ "${#value}" -ge 2 ] && [[ "${value:0:1}" == "\"" || "${value:0:1}" == "'" ]] && [[ "${value: -1}" == "${value:0:1}" ]]; then
                    value="${value:1:${#value}-2}"
                fi
                printf '%s' "$value"
                return 0
                ;;
        esac
    done < "$file"
}

random_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    fi
}

urlencode() {
    local LC_ALL=C text="$1" output="" char hex i
    for ((i = 0; i < ${#text}; i++)); do
        char="${text:i:1}"
        case "$char" in
            [a-zA-Z0-9.~_-]) output+="$char" ;;
            *) printf -v hex '%02X' "'$char"; output+="%$hex" ;;
        esac
    done
    printf '%s' "$output"
}

env_write() {
    local file="$1" entry key line managed tmp
    shift
    local -a entries=("$@")
    tmp=$(mktemp "${file}.tmp.XXXXXX") || return 1
    if [ -f "$file" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            key="${line%%=*}"
            managed=0
            for entry in "${entries[@]}"; do
                if [ "$key" = "${entry%%=*}" ]; then managed=1; break; fi
            done
            case "$key" in POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_PORT) managed=1 ;; esac
            if [ "$managed" = 0 ]; then printf '%s\n' "$line" >> "$tmp"; fi
        done < "$file"
    fi
    for entry in "${entries[@]}"; do printf '%s\n' "$entry" >> "$tmp"; done
    chmod 600 "$tmp"
    mv -f "$tmp" "$file"
}

legacy_database_url() {
    local file="${1:-.env}" host="${2:-127.0.0.1}" user password database port
    user=$(env_get POSTGRES_USER "$file")
    password=$(env_get POSTGRES_PASSWORD "$file")
    database=$(env_get POSTGRES_DB "$file")
    port=$(env_get POSTGRES_PORT "$file")
    port="${port:-5432}"
    [ -n "$password" ] || return 0
    case "$port" in *[!0-9]*) port="5432" ;; esac
    printf 'postgresql://%s:%s@%s:%s/%s' "$(urlencode "${user:-noma}")" "$(urlencode "$password")" "$host" "$port" "$(urlencode "${database:-noma}")"
}
