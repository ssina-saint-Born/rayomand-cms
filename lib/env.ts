import { readFileSync, existsSync } from "node:fs";

// Minimal .env loader so the mail daemon can start without extra packages.
// Existing environment variables always win over file values.
export function loadEnv(file = ".env"): void {
    if (!existsSync(file))
        return;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!match || match[1].startsWith("#"))
            continue;
        const value = match[2].replace(/^["']|["']$/g, "");
        if (process.env[match[1]] === undefined)
            process.env[match[1]] = value;
    }
}
