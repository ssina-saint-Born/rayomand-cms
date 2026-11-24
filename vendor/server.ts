import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildPackage, sha256 } from "../lib/theme/package";

// Reference sales server for the vendor side of the frontend-packaging flow.
//
// This is NOT part of what ships to customers as the CMS. It implements the
// three-endpoint contract that a storefront must expose so a Rayomand install
// can redeem a serial and download the purchased frontend. The user's company
// storefront can copy this logic; it runs standalone here so the whole path can
// be exercised end to end.
//
//   node/tsx vendor/server.ts            (PORT=4200 by default)
//
// Endpoints (public):
//   POST /api/license/activate   {serial,host,fingerprint,cms_version}
//   GET  /api/license/download   ?token=...
//   POST /api/license/validate   {serial,host,fingerprint}
// Admin (Authorization: Bearer <VENDOR_ADMIN_TOKEN>):
//   POST /api/admin/serials      issue a serial for a product
//   GET  /api/admin/serials      list serials + activations
//   POST /api/admin/revoke       {serial}
//   GET  /api/admin/products     list products
//
// State lives in vendor/data/state.json (git-ignored). Signing keys live in
// vendor/data/ed25519-private.pem and never leave the vendor.

const PORT = Number(process.env.VENDOR_PORT || 4200);
const DATA_DIR = path.join(process.cwd(), "vendor", "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const KEY_FILE = path.join(DATA_DIR, "ed25519-private.pem");
const ADMIN_TOKEN = process.env.VENDOR_ADMIN_TOKEN || "";
const MAX_INSTALLS_DEFAULT = Number(process.env.VENDOR_MAX_INSTALLS || 1);

// ── Products ────────────────────────────────────────────────────────────────
// In a real storefront these come from the product catalogue. Here they are
// generated packages so the flow is testable without shipping real assets.

interface ProductDef {
    id: string;
    slug: string;
    name: string;
    version: string;
    install_class: "t1" | "t2" | "t3";
    build(): Buffer;
}

function themeJson(slug: string, name: string) {
    return JSON.stringify({
        slug, name,
        description: `${name} — a sample frontend sold by the reference vendor.`,
        version: "1.0.0",
        tokens: { accent: "#b23a2e", bg: "#fbfaf7", text: "#20201d", radius: 10, font: "serif" },
        layout: { header: "classic", footer: "columns", card: "soft", width: "wide" },
        home: [{ type: "hero", title: `${name}`, subtitle: "Sample storefront" }],
    }, null, 2);
}

const PRODUCTS: ProductDef[] = [
    {
        id: "aurora", slug: "aurora", name: "Aurora", version: "1.0.0", install_class: "t1",
        build: () => buildPackage({
            slug: "aurora", name: "Aurora", version: "1.0.0", install_class: "t1",
            description: "Declarative editorial theme",
            files: [{ name: "theme.json", data: Buffer.from(themeJson("aurora", "Aurora")) }],
        }),
    },
    {
        id: "storefront", slug: "storefront", name: "Storefront Static", version: "1.0.0", install_class: "t2",
        build: () => buildPackage({
            slug: "storefront", name: "Storefront Static", version: "1.0.0", install_class: "t2",
            entry: "index.html",
            files: [
                { name: "index.html", data: Buffer.from("<!doctype html><html><body><h1>Storefront</h1><script src=\"config.js\"></script></body></html>") },
                { name: "assets/app.css", data: Buffer.from("body{font-family:sans-serif}") },
            ],
        }),
    },
    {
        id: "studio-ssr", slug: "studio-ssr", name: "Studio SSR", version: "1.0.0", install_class: "t3",
        build: () => buildPackage({
            slug: "studio-ssr", name: "Studio SSR", version: "1.0.0", install_class: "t3",
            entry: "server.js",
            start: { command: "node server.js", port: 4173 },
            files: [{ name: "server.js", data: Buffer.from("require('http').createServer((q,s)=>s.end('ok')).listen(process.env.PORT||4173)") }],
        }),
    },
];

// ── State ───────────────────────────────────────────────────────────────────
interface Activation { host: string; fingerprint: string; ip: string; at: string }
interface Serial {
    serial: string;
    product: string;
    status: "active" | "revoked";
    max_installs: number;
    domain: string;
    activations: Activation[];
    created_at: string;
}
interface State { serials: Record<string, Serial> }

function loadState(): State {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
    catch { return { serials: {} }; }
}
function saveState(state: State): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function privateKey(): crypto.KeyObject {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(KEY_FILE)) {
        const { privateKey: pem } = crypto.generateKeyPairSync("ed25519");
        fs.writeFileSync(KEY_FILE, pem.export({ format: "pem", type: "pkcs8" }) as string, { mode: 0o600 });
    }
    return crypto.createPrivateKey(fs.readFileSync(KEY_FILE, "utf8"));
}

function publicKeyPem(): string {
    const priv = privateKey();
    return crypto.createPublicKey(priv).export({ format: "pem", type: "spki" }) as string;
}

function b64url(buf: Buffer): string {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintSerial(product: string, slug: string, maxInstalls: number, domain: string, days = 0): string {
    const payload = {
        s: crypto.randomBytes(9).toString("hex").toUpperCase(),
        p: product,
        t: slug,
        i: Math.floor(Date.now() / 1000),
        e: days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : 0,
        n: maxInstalls,
        h: domain,
    };
    const bytes = Buffer.from(JSON.stringify(payload));
    const sig = crypto.sign(null, bytes, privateKey());
    return `RM1.${b64url(bytes)}.${b64url(sig)}`;
}

// ── Download tokens ─────────────────────────────────────────────────────────
interface DLToken { serial: string; slug: string; expires: number; uses: number }
const downloadTokens = new Map<string, DLToken>();

function issueToken(serial: string, slug: string): string {
    const token = crypto.randomBytes(24).toString("hex");
    downloadTokens.set(token, { serial, slug, expires: Date.now() + 10 * 60_000, uses: 0 });
    return token;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function json(res: http.ServerResponse, status: number, body: unknown): void {
    const data = Buffer.from(JSON.stringify(body));
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": String(data.length) });
    res.end(data);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

function isAdmin(req: http.IncomingMessage): boolean {
    if (!ADMIN_TOKEN) return false;
    return (req.headers.authorization || "") === `Bearer ${ADMIN_TOKEN}`;
}

function clientIp(req: http.IncomingMessage): string {
    return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function findSerial(state: State, value: string): Serial | null {
    const clean = String(value || "").trim();
    if (state.serials[clean]) return state.serials[clean];
    for (const s of Object.values(state.serials)) if (s.serial === clean) return s;
    return null;
}

// ── Request handler ─────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    try {
        if (req.method === "POST" && url.pathname === "/api/license/activate") {
            const body = await readJson(req);
            const state = loadState();
            const serial = findSerial(state, body.serial);
            if (!serial) return json(res, 404, { ok: false, reason: "serial", message: "Unknown serial." });
            if (serial.status === "revoked") return json(res, 403, { ok: false, reason: "serial", message: "This serial has been revoked." });

            const host = String(body.host || "").toLowerCase();
            const fingerprint = String(body.fingerprint || "");
            if (serial.domain && serial.domain !== host)
                return json(res, 403, { ok: false, reason: "serial", message: `This serial is bound to ${serial.domain}.` });

            const sameSite = serial.activations.find((a) => a.host === host && a.fingerprint === fingerprint);
            const sameHost = serial.activations.find((a) => a.host === host);
            const distinct = new Set(serial.activations.map((a) => a.fingerprint)).size;
            if (!sameSite && !sameHost && distinct >= serial.max_installs)
                return json(res, 409, { ok: false, reason: "install_limit", message: `This serial is already used on ${distinct} site(s); its limit is ${serial.max_installs}.` });

            if (!sameSite) serial.activations.push({ host, fingerprint, ip: clientIp(req), at: new Date().toISOString() });
            saveState(state);

            const product = PRODUCTS.find((p) => p.id === serial.product);
            const token = issueToken(serial.serial, serial.product);
            return json(res, 200, {
                ok: true,
                token,
                download_url: `/api/license/download?token=${token}`,
                theme: product?.slug || serial.product,
                expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
            });
        }

        if (req.method === "GET" && url.pathname === "/api/license/download") {
            const token = url.searchParams.get("token") || "";
            const entry = downloadTokens.get(token);
            if (!entry || entry.expires < Date.now() || entry.uses >= 3)
                return json(res, 403, { ok: false, message: "The download token is invalid or expired." });
            entry.uses++;
            const product = PRODUCTS.find((p) => p.id === entry.slug);
            if (!product) return json(res, 404, { ok: false, message: "Product not found." });
            const zip = product.build();
            res.writeHead(200, {
                "Content-Type": "application/zip",
                "Content-Length": String(zip.length),
                "Content-Disposition": `attachment; filename="${product.slug}.zip"`,
                "X-Content-SHA256": sha256(zip),
            });
            return res.end(zip);
        }

        if (req.method === "POST" && url.pathname === "/api/license/validate") {
            const body = await readJson(req);
            const serial = findSerial(loadState(), body.serial);
            if (!serial) return json(res, 404, { ok: false, reason: "serial", message: "Unknown serial." });
            if (serial.status === "revoked") return json(res, 403, { ok: false, reason: "serial", message: "Revoked." });
            return json(res, 200, { ok: true, product: serial.product, activations: serial.activations.length, max_installs: serial.max_installs });
        }

        if (url.pathname === "/api/admin/serials" && isAdmin(req)) {
            const state = loadState();
            if (req.method === "GET") return json(res, 200, { ok: true, serials: Object.values(state.serials) });
            if (req.method === "POST") {
                const body = await readJson(req);
                const product = PRODUCTS.find((p) => p.id === body.product || p.slug === body.product);
                if (!product) return json(res, 400, { ok: false, message: "Unknown product." });
                const maxInstalls = Number(body.max_installs || MAX_INSTALLS_DEFAULT);
                const serial = mintSerial(product.id, product.slug, maxInstalls, String(body.domain || ""), Number(body.days || 0));
                state.serials[serial] = {
                    serial, product: product.id, status: "active", max_installs: maxInstalls,
                    domain: String(body.domain || ""), activations: [], created_at: new Date().toISOString(),
                };
                saveState(state);
                return json(res, 201, { ok: true, serial, product: product.id });
            }
        }

        if (req.method === "POST" && url.pathname === "/api/admin/revoke" && isAdmin(req)) {
            const body = await readJson(req);
            const state = loadState();
            const serial = findSerial(state, body.serial);
            if (!serial) return json(res, 404, { ok: false, message: "Unknown serial." });
            serial.status = "revoked";
            saveState(state);
            return json(res, 200, { ok: true });
        }

        if (req.method === "GET" && url.pathname === "/api/admin/products" && isAdmin(req)) {
            return json(res, 200, {
                ok: true,
                public_key: publicKeyPem(),
                products: PRODUCTS.map((p) => ({ id: p.id, slug: p.slug, name: p.name, install_class: p.install_class })),
            });
        }

        json(res, 404, { ok: false, message: "Not found." });
    }
    catch (error: any) {
        json(res, 500, { ok: false, message: String(error?.message || error) });
    }
});

server.listen(PORT, () => {
    console.log(`[vendor] reference sales server on http://localhost:${PORT}`);
    console.log(`[vendor] admin token ${ADMIN_TOKEN ? "set" : "NOT set — admin endpoints disabled"}`);
    console.log(`[vendor] public key:\n${publicKeyPem()}`);
});
