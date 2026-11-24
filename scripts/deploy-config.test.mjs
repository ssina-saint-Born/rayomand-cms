import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseBundledDatabaseUrl, writeBundledDatabaseFiles } from "./postgres-url-init.mjs";

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "rayomand-deploy-"));
}

function envMap(text) {
    const values = new Map();
    for (const line of text.split(/\r?\n/)) {
        const equal = line.indexOf("=");
        if (equal > 0 && !line.startsWith("#"))
            values.set(line.slice(0, equal), line.slice(equal + 1));
    }
    return values;
}

test("bundled URL parser decodes credentials and database names", () => {
    assert.deepEqual(
        parseBundledDatabaseUrl("postgresql://ray%20omand:p%40ss%3Aword%23@postgres:5432/rayo%20mand"),
        { user: "ray omand", password: "p@ss:word#", database: "rayo mand" },
    );
});

test("bundled URL parser rejects external hosts, wrong schemes and unsafe names", () => {
    assert.throws(() => parseBundledDatabaseUrl("postgresql://u:p@db.example.com:5432/app"), /host 'postgres'/);
    assert.throws(() => parseBundledDatabaseUrl("mysql://u:p@postgres:5432/app"), /must use postgresql/);
    assert.throws(() => parseBundledDatabaseUrl("postgresql://u:p@postgres:5432/"), /database name/);
    assert.throws(() => parseBundledDatabaseUrl("postgresql://u:p%0A@postgres:5432/app"), /line breaks/);
});

test("bundled URL parser writes the three official-postgres files", () => {
    const dir = tempDir();
    writeBundledDatabaseFiles("postgresql://rayomand:secret@postgres/rayomand", dir);
    assert.equal(fs.readFileSync(path.join(dir, "user"), "utf8"), "rayomand");
    assert.equal(fs.readFileSync(path.join(dir, "password"), "utf8"), "secret");
    assert.equal(fs.readFileSync(path.join(dir, "database"), "utf8"), "rayomand");
});

function runConfigure(dir, args = []) {
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.copyFileSync(path.join(import.meta.dirname, "env-file.sh"), path.join(dir, "scripts", "env-file.sh"));
    fs.copyFileSync(path.join(import.meta.dirname, "configure-docker.sh"), path.join(dir, "scripts", "configure-docker.sh"));
    return spawnSync("bash", ["scripts/configure-docker.sh", ...args], { cwd: dir, encoding: "utf8" });
}

test("Docker configuration creates one URL and independent secrets", () => {
    const dir = tempDir();
    const result = runConfigure(dir, ["--web-port", "8080"]);
    assert.equal(result.status, 0, result.stderr);
    const values = envMap(fs.readFileSync(path.join(dir, ".env"), "utf8"));
    assert.match(values.get("DATABASE_URL"), /^postgresql:\/\/rayomand:[0-9a-f]{64}@postgres:5432\/rayomand$/);
    assert.match(values.get("SETUP_TOKEN"), /^[0-9a-f]{64}$/);
    assert.match(values.get("MAIL_SESSION_SECRET"), /^[0-9a-f]{64}$/);
    assert.notEqual(values.get("SETUP_TOKEN"), values.get("MAIL_SESSION_SECRET"));
    assert.equal(values.get("WEB_PORT"), "8080");
    assert.equal(values.has("POSTGRES_PASSWORD"), false);
});

test("Docker configuration migrates legacy credentials without keeping split variables", () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.writeFileSync(path.join(dir, ".env"), [
        "POSTGRES_DB=old_db",
        "POSTGRES_USER=old_user",
        "POSTGRES_PASSWORD=p@ss word#1",
        "POSTGRES_PORT=5432",
        "SETUP_TOKEN=existing-token",
        "MAIL_IMAP_PORT=143",
    ].join("\n"));
    const result = runConfigure(dir);
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(path.join(dir, ".env"), "utf8");
    const values = envMap(text);
    const url = new URL(values.get("DATABASE_URL"));
    assert.equal(url.hostname, "postgres");
    assert.equal(decodeURIComponent(url.username), "old_user");
    assert.equal(decodeURIComponent(url.password), "p@ss word#1");
    assert.equal(url.pathname, "/old_db");
    assert.equal(values.get("SETUP_TOKEN"), "existing-token");
    assert.equal(values.get("MAIL_IMAP_PORT"), "143");
    assert.equal(text.includes("POSTGRES_"), false);
});

test("Docker configuration replaces the example placeholder and is idempotent", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, ".env"), "DATABASE_URL=postgresql://rayomand:replace-with-a-long-random-password@postgres:5432/rayomand\nSETUP_TOKEN=\nMAIL_SESSION_SECRET=\n");
    const first = runConfigure(dir, ["--web-port", "9090"]);
    assert.equal(first.status, 0, first.stderr);
    const firstValues = envMap(fs.readFileSync(path.join(dir, ".env"), "utf8"));
    assert.doesNotMatch(firstValues.get("DATABASE_URL"), /replace-with/);
    const second = runConfigure(dir, ["--web-port", "9090"]);
    assert.equal(second.status, 0, second.stderr);
    const secondValues = envMap(fs.readFileSync(path.join(dir, ".env"), "utf8"));
    assert.equal(secondValues.get("DATABASE_URL"), firstValues.get("DATABASE_URL"));
    assert.equal(secondValues.get("SETUP_TOKEN"), firstValues.get("SETUP_TOKEN"));
});

test("local setup migrates legacy split variables to one URL", () => {
    const dir = tempDir();
    fs.copyFileSync(path.join(import.meta.dirname, "..", "setup-database.mjs"), path.join(dir, "setup-database.mjs"));
    fs.writeFileSync(path.join(dir, ".env"), [
        "POSTGRES_DB=noma",
        "POSTGRES_USER=noma",
        "POSTGRES_PASSWORD=legacy password",
        "POSTGRES_PORT=55432",
        "MAIL_IMAP_PORT=143",
    ].join("\n"));
    const emptyPath = path.join(dir, "empty-bin");
    fs.mkdirSync(emptyPath);
    const result = spawnSync(process.execPath, ["setup-database.mjs"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: emptyPath, DATABASE_URL: "", SETUP_TOKEN: "", MAIL_SESSION_SECRET: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(path.join(dir, ".env"), "utf8");
    const values = envMap(text);
    const url = new URL(values.get("DATABASE_URL"));
    assert.equal(url.port, "55432");
    assert.equal(decodeURIComponent(url.password), "legacy password");
    assert.equal(values.get("MAIL_IMAP_PORT"), "143");
    assert.equal(text.includes("POSTGRES_"), false);
});

test("database preflight rejects non-PostgreSQL URLs", () => {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, "db-preflight.mjs")], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: "https://example.com/db" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /valid postgresql/);
});
