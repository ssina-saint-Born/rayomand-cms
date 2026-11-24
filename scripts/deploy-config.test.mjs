import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseBundledDatabaseUrl, writeBundledDatabaseFiles, bundledConnectionUrl } from "./postgres-url-init.mjs";

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
        { user: "ray omand", password: "p@ss:word#", database: "rayo mand", host: "postgres", port: 5432 },
    );
});

test("bundled URL parser rejects wrong schemes and unsafe names", () => {
    assert.throws(() => parseBundledDatabaseUrl("mysql://u:p@postgres:5432/app"), /must use postgresql/);
    assert.throws(() => parseBundledDatabaseUrl("postgresql://u:p@postgres:5432/"), /database name/);
    assert.throws(() => parseBundledDatabaseUrl("postgresql://u:p%0A@postgres:5432/app"), /line breaks/);
    assert.throws(() => parseBundledDatabaseUrl("postgresql://u:p@postgres:0/app"), /invalid port/);
});

// Coolify may hand out a generated hostname for a database it created, so the
// bundled stack must not reject it: it rewrites the connection to its own
// internal `postgres` service and keeps only the credentials and database name.
test("bundled URL parser keeps credentials but always targets the internal service", () => {
    const parsed = parseBundledDatabaseUrl("postgresql://rayomand:secret@u207sgiseqosuuqfc49xwiem:5432/rayomand");
    assert.equal(parsed.host, "u207sgiseqosuuqfc49xwiem");
    assert.equal(
        bundledConnectionUrl(parsed),
        "postgresql://rayomand:secret@postgres:5432/rayomand",
    );
    assert.equal(
        bundledConnectionUrl("postgresql://rayomand:secret@db.example.com/rayomand"),
        "postgresql://rayomand:secret@postgres:5432/rayomand",
    );
});

test("bundled URL parser writes the three official-postgres files", () => {
    const dir = tempDir();
    writeBundledDatabaseFiles("postgresql://rayomand:secret@postgres/rayomand", dir);
    assert.equal(fs.readFileSync(path.join(dir, "user"), "utf8"), "rayomand");
    assert.equal(fs.readFileSync(path.join(dir, "password"), "utf8"), "secret");
    assert.equal(fs.readFileSync(path.join(dir, "database"), "utf8"), "rayomand");
    assert.equal(fs.readFileSync(path.join(dir, "url"), "utf8"), "postgresql://rayomand:secret@postgres:5432/rayomand");
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

// Coolify runs Compose from an artifacts directory, not the repository. A
// relative bind mount like ./scripts/x.mjs therefore resolves to a missing
// path, Docker creates an empty directory, and the one-shot init container
// exits 1 before the database ever starts. Keep the bootstrap script baked
// into an image instead.
for (const file of ["compose.yaml", "compose.coolify.yaml"]) {
    test(`${file} bakes the bootstrap script instead of bind-mounting it`, () => {
        const text = fs.readFileSync(path.join(import.meta.dirname, "..", file), "utf8");
        // Only inspect volume entries; comments legitimately mention ./scripts.
        const binds = text.split(/\r?\n/).filter((line) => /^\s*-\s*\.\//.test(line));
        assert.deepEqual(binds, [], `${file} must not use host-relative bind mounts: ${binds.join(", ")}`);
        assert.match(text, /dockerfile:\s*Dockerfile\.init/, `${file} must build postgres-init from Dockerfile.init`);
        assert.match(text, /DB_INIT_DIR:\s*\/db-init/, `${file} must pass DB_INIT_DIR`);
        assert.match(text, /DATABASE_URL_FILE:\s*\/db-init\/url/, `${file} must let the app read the rewritten URL`);
        assert.match(text, /postgres-init:\/db-init:ro/, `${file} must mount the init volume into the app`);
    });
}

test("Dockerfile.init copies the bootstrap script and runs it", () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, "..", "Dockerfile.init"), "utf8");
    assert.match(text, /COPY scripts\/postgres-url-init\.mjs/);
    assert.match(text, /ENTRYPOINT \["node", "\/app\/postgres-url-init\.mjs"\]/);
});

// Coolify attaches a domain to the first service when none is selected. If that
// is the one-shot postgres-init, Traefik routes to a container that has already
// exited: the browser sees a default self-signed certificate and "no available
// server". `app` must stay first, and it must accept traffic on port 80 as well
// because domains without an explicit port are proxied to 80.
for (const file of ["compose.yaml", "compose.coolify.yaml"]) {
    test(`${file} lists app first and accepts port 80`, () => {
        const text = fs.readFileSync(path.join(import.meta.dirname, "..", file), "utf8");
        const services = text.split(/^services:\s*$/m)[1]?.split(/^volumes:/m)[0] ?? "";
        const firstService = /^ {2}([a-z0-9-]+):\s*$/m.exec(services)?.[1];
        assert.equal(firstService, "app", `${file} must declare app before postgres-init`);
        assert.match(text, /WEB_ALIAS_PORT:\s*80/, `${file} must enable the port 80 alias`);
    });
}

test("serve.ts starts the port alias listener", () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, "..", "scripts", "serve.ts"), "utf8");
    assert.match(text, /WEB_ALIAS_PORT/);
    assert.match(text, /startAliasListener\(\);/);
});

// Behind a TLS-terminating proxy Next.js sees http:// on req.url while the
// browser sends Origin: https://…, so the setup endpoint must compare
// hostnames, not full origins, or every first-owner creation returns 403
// "Invalid origin". The check must stay a hard rejection (it is the CSRF
// guard); what widens is the set of trustworthy host sources.
test("setup origin guard compares hostnames and consults Coolify env vars", () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, "..", "app", "api", "auth", "setup", "route.ts"), "utf8");
    assert.doesNotMatch(text, /new URL\(req\.url\)\.origin\s*\)/, "must not compare full origins");
    assert.match(text, /hostname/, "must compare hostnames");
    assert.match(text, /x-forwarded-host/, "must consider the proxy's forwarded host");
    assert.match(text, /if \(!origin\)\s*\n\s*return true;/, "non-browser clients without Origin must pass");
    assert.match(text, /if \(!sameOrigin\(req\)\) return fail\("Invalid origin", 403\);/, "a mismatch must still be rejected");
    assert.match(text, /COOLIFY_FQDN/, "must accept Coolify's injected public hostname");
    assert.match(text, /SERVICE_URL_\\w\+/, "must accept the per-service public URL");
    assert.match(text, /guard: GUARD_VERSION/, "GET must report the guard version");
});

