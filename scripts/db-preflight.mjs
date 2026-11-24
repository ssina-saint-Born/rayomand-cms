import fs from "node:fs";
import net from "node:net";

// Non-fatal database reachability check used by install.sh. It does not need
// psql: it parses DATABASE_URL and opens a TCP connection. Schema migrations
// happen on the first HTTP request, so a down database here is a warning, not
// a failure — the operator may start PostgreSQL after installing.

function readDatabaseUrl() {
    try {
        const text = fs.readFileSync(".env", "utf8");
        const line = text.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
        return line ? line.slice("DATABASE_URL=".length).trim() : process.env.DATABASE_URL || "";
    }
    catch {
        return process.env.DATABASE_URL || "";
    }
}

const url = readDatabaseUrl();
if (!url) {
    console.log("DATABASE_URL is not set.");
    process.exit(1);
}

let host = "127.0.0.1";
let port = 5432;
try {
    const parsed = new URL(url);
    host = parsed.hostname || host;
    port = Number(parsed.port || 5432);
}
catch {
    console.log("DATABASE_URL is not a valid postgresql:// URL.");
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
