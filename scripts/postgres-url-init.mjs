import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
    if (url.hostname.toLowerCase() !== "postgres")
        throw new Error("The bundled PostgreSQL stack requires DATABASE_URL to use host 'postgres'. Use compose.external-db.yaml for an external database.");

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
    const database = decode(url.pathname.slice(1), "database name");
    if (database.includes("/"))
        throw new Error("DATABASE_URL must name exactly one database.");
    return { user, password, database };
}

export function writeBundledDatabaseFiles(value, directory) {
    const values = parseBundledDatabaseUrl(value);
    fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    // The official PostgreSQL image reads these files as its own non-root user,
    // so they must be readable by uid 70 (alpine) / 999 (debian). Only the
    // postgres-init and postgres containers mount this volume.
    for (const [name, content] of Object.entries({ user: values.user, password: values.password, database: values.database }))
        fs.writeFileSync(path.join(directory, name), content, { mode: 0o644 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        writeBundledDatabaseFiles(process.env.DATABASE_URL || "", process.env.DB_INIT_DIR || "/db-init");
    }
    catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
