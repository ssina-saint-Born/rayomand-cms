import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The bundled stacks (compose.yaml, compose.coolify.yaml) always ship their own
// PostgreSQL service named `postgres`. Only the credentials and database name in
// DATABASE_URL matter here; the host/port are ignored and rewritten to the
// internal service. That keeps deployment working even when an operator pastes
// a Coolify-generated hostname or an external server address. For a truly
// external database, use compose.external-db.yaml instead.
const INTERNAL_HOST = "postgres";
const INTERNAL_PORT = 5432;

export function parseBundledDatabaseUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
    }
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
        throw new Error("DATABASE_URL must use postgresql:// or postgres://.");

    const decode = (part, label) => {
        let text;
        try {
            text = decodeURIComponent(part);
        }
        catch {
            throw new Error(`DATABASE_URL has invalid percent-encoding in ${label}.`);
        }
        if (!text || /[\0\r\n]/.test(text))
            throw new Error(`DATABASE_URL must contain a non-empty ${label} without line breaks.`);
        return text;
    };
    const user = decode(url.username, "username");
    const password = decode(url.password, "password");
    const database = decode(url.pathname.replace(/^\//, ""), "database name");
    if (database.includes("/"))
        throw new Error("DATABASE_URL must name exactly one database.");
    const host = url.hostname.toLowerCase();
    const port = Number(url.port || INTERNAL_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("DATABASE_URL has an invalid port.");
    return { user, password, database, host, port };
}

// Connection string the app container should use: same credentials, internal host.
export function bundledConnectionUrl(value) {
    const { user, password, database } = typeof value === "string" ? parseBundledDatabaseUrl(value) : value;
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
    return `postgresql://${auth}@${INTERNAL_HOST}:${INTERNAL_PORT}/${encodeURIComponent(database)}`;
}

export function writeBundledDatabaseFiles(value, directory) {
    const parsed = parseBundledDatabaseUrl(value);
    fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    // The official PostgreSQL image reads these files as its own non-root user,
    // so they must be readable by uid 70 (alpine) / 999 (debian). Only the
    // postgres-init, postgres and app containers mount this volume.
    const files = {
        user: parsed.user,
        password: parsed.password,
        database: parsed.database,
        // Read by the app through DATABASE_URL_FILE so the web process and the
        // database agree even when DATABASE_URL named a different host.
        url: bundledConnectionUrl(parsed),
    };
    for (const [name, content] of Object.entries(files))
        fs.writeFileSync(path.join(directory, name), content, { mode: 0o644 });
    return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const parsed = writeBundledDatabaseFiles(process.env.DATABASE_URL || "", process.env.DB_INIT_DIR || "/db-init");
        if (parsed.host !== INTERNAL_HOST)
            console.warn(`DATABASE_URL host "${parsed.host}" ignored: the bundled stack always uses the internal "${INTERNAL_HOST}" service. Use compose.external-db.yaml for an external database.`);
        console.log(`PostgreSQL bootstrap ready for database "${parsed.database}" on ${INTERNAL_HOST}:${INTERNAL_PORT}.`);
    }
    catch (error) {
        console.error(`postgres-init failed: ${error.message}`);
        process.exit(1);
    }
}
