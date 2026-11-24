import fs from "node:fs";
import net from "node:net";

function readDatabaseUrl() {
    if (process.env.DATABASE_URL)
        return process.env.DATABASE_URL.trim();
    try {
        const text = fs.readFileSync(".env", "utf8");
        const line = text.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
        if (!line)
            return "";
        let value = line.slice("DATABASE_URL=".length).trim();
        if (value.length >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))))
            value = value.slice(1, -1);
        return value;
    }
    catch {
        return "";
    }
}

const value = readDatabaseUrl();
if (!value) {
    console.log("DATABASE_URL is not set.");
    process.exit(1);
}

let host;
let port;
try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
        throw new Error("unsupported protocol");
    if (!parsed.hostname)
        throw new Error("missing host");
    host = parsed.hostname.replace(/^\[|\]$/g, "");
    port = Number(parsed.port || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("invalid port");
}
catch {
    console.log("DATABASE_URL must be a valid postgresql:// URL with a host and port.");
    process.exit(1);
}

const socket = net.createConnection({ host, port });
const done = (ok, message) => {
    socket.destroy();
    console.log(message);
    process.exit(ok ? 0 : 1);
};
const timer = setTimeout(() => done(false, `Timed out connecting to PostgreSQL at ${host}:${port}.`), 5000);
socket.once("connect", () => { clearTimeout(timer); done(true, `PostgreSQL reachable at ${host}:${port}.`); });
socket.once("error", (error) => { clearTimeout(timer); done(false, `PostgreSQL not reachable at ${host}:${port}: ${error.message}`); });
