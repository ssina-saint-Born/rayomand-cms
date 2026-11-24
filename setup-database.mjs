import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const LEGACY_KEYS = new Set(["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_PORT"]);
const MANAGED_KEYS = new Set(["DATABASE_URL", "SETUP_TOKEN", "MAIL_SESSION_SECRET", ...LEGACY_KEYS]);

function parseEnv(text) {
    const values = new Map();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const equal = line.indexOf("=");
        if (equal < 1)
            continue;
        const key = line.slice(0, equal).trim();
        let value = line.slice(equal + 1).trim();
        if (value.length >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))))
            value = value.slice(1, -1);
        values.set(key, value);
    }
    return values;
}

function renderEnv(text, entries) {
    const lines = text ? text.split(/\r?\n/) : [];
    const kept = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            return true;
        const equal = trimmed.indexOf("=");
        return equal < 1 || !MANAGED_KEYS.has(trimmed.slice(0, equal).trim());
    });
    while (kept.length && !kept[kept.length - 1].trim())
        kept.pop();
    if (kept.length)
        kept.push("");
    kept.push(...entries);
    return kept.join("\n") + "\n";
}

function legacyUrl(values) {
    const password = values.get("POSTGRES_PASSWORD");
    if (!password)
        return "";
    const user = values.get("POSTGRES_USER") || "noma";
    const database = values.get("POSTGRES_DB") || "noma";
    const port = values.get("POSTGRES_PORT") || "5432";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${encodeURIComponent(port)}/${encodeURIComponent(database)}`;
}

function validateDatabaseUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("DATABASE_URL is not a valid URL.");
    }
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
        throw new Error("DATABASE_URL must use postgresql:// or postgres://.");
    if (!url.hostname)
        throw new Error("DATABASE_URL must include a database host.");
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("DATABASE_URL has an invalid port.");
    return url;
}

const existing = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const values = parseEnv(existing);
const databaseUrl = process.env.DATABASE_URL || values.get("DATABASE_URL") || legacyUrl(values);
if (!databaseUrl || databaseUrl.includes("replace-with-a-long-random-password")) {
    console.error("DATABASE_URL is required. Set it in .env or the environment first.");
    console.error("  Bare metal: ./scripts/provision-postgres.sh");
    console.error("  Docker:     ./scripts/configure-docker.sh");
    console.error("  External:   DATABASE_URL=postgresql://user:password@host:5432/database npm run db:setup");
    process.exit(1);
}
const setupToken = process.env.SETUP_TOKEN || values.get("SETUP_TOKEN") || randomBytes(32).toString("hex");
const mailSecret = process.env.MAIL_SESSION_SECRET || values.get("MAIL_SESSION_SECRET") || randomBytes(32).toString("hex");

let parsed;
try {
    parsed = validateDatabaseUrl(databaseUrl);
}
catch (error) {
    console.error(error.message);
    process.exit(1);
}

const next = renderEnv(existing, [
    `DATABASE_URL=${databaseUrl}`,
    `SETUP_TOKEN=${setupToken}`,
    `MAIL_SESSION_SECRET=${mailSecret}`,
]);
fs.writeFileSync(".env", next, { mode: 0o600 });
try {
    fs.chmodSync(".env", 0o600);
}
catch { }

console.log(existing ? "Updated .env: one DATABASE_URL; legacy POSTGRES_* entries removed." : "Created private .env with one DATABASE_URL.");
console.log(`PostgreSQL target: ${parsed.hostname}:${parsed.port || 5432}`);
console.log("Use SETUP_TOKEN from .env to create the first owner. Schema migrations run automatically on first request.");

const ready = spawnSync("pg_isready", ["-h", parsed.hostname, "-p", parsed.port || "5432"], { stdio: "pipe", shell: false, encoding: "utf8" });
if (ready.error) {
    console.log("pg_isready was not found on PATH; start PostgreSQL, then run \"npm run dev\".");
    process.exit(0);
}
if (ready.status !== 0) {
    console.error(`PostgreSQL is not accepting connections at ${parsed.hostname}:${parsed.port || 5432}.`);
    console.error("Start the server (for example: pg_ctl start, or your system service), then retry.");
    process.exit(ready.status ?? 1);
}

console.log(`PostgreSQL is reachable at ${parsed.hostname}:${parsed.port || 5432}.`);
