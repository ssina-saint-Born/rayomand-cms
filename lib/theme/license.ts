import crypto from "node:crypto";

// License tokens are signed offline by the vendor and verified here with an
// embedded public key, so a customer can activate a premium theme without the
// site ever calling the vendor. Format:
//   RM1.<base64url(payload JSON)>.<base64url(ed25519 signature)>
// The signature covers the exact payload bytes, which are carried inside the
// token — there is no separate certificate to fetch or expire.

const PUBLIC_KEY_B64 =
    "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMlZ3QXlFQUpkbnROSTArMllCNy81dmJoQUFjek4yU2JGb053TTRkTjBFV0dlWUVua1U9Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=";

export const SERIAL_PREFIX = "RM1";

export interface LicensePayload {
    /** serial identifier (shown to the buyer) */
    s: string;
    /** product id the license unlocks */
    p: string;
    /** theme slug this license is bound to ("" = any theme of the product) */
    t: string;
    /** issue time, unix seconds */
    i: number;
    /** expiry time, unix seconds (0 = perpetual) */
    e: number;
    /** maximum number of sites (informational; this install counts as one) */
    n: number;
    /** optional hostname binding, "" = unbound */
    h: string;
}

export interface VerifiedLicense {
    ok: true;
    payload: LicensePayload;
    expiresAt: string | null;
    perpetual: boolean;
    host: string;
}

export interface LicenseError {
    ok: false;
    reason: "malformed" | "signature" | "expired" | "host" | "product";
    message: string;
}

function b64url(buf: Buffer): string {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Buffer {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64");
}

export function normalizeSerial(input: string): string {
    return String(input || "").replace(/\s+/g, "").trim();
}

export function verifyLicense(
    serial: string,
    opts: { product?: string; theme?: string; host?: string; now?: number } = {},
): VerifiedLicense | LicenseError {
    const token = normalizeSerial(serial);
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== SERIAL_PREFIX)
        return { ok: false, reason: "malformed", message: "This is not a Rayomand theme serial." };

    const payloadBytes = fromB64url(parts[1]);
    const signature = fromB64url(parts[2]);
    if (!payloadBytes.length || !signature.length)
        return { ok: false, reason: "malformed", message: "The serial is incomplete." };

    let publicKey: crypto.KeyObject;
    try {
        publicKey = crypto.createPublicKey(Buffer.from(PUBLIC_KEY_B64, "base64").toString("utf8"));
    }
    catch {
        return { ok: false, reason: "signature", message: "The license verifier is misconfigured." };
    }

    let valid = false;
    try {
        valid = crypto.verify(null, payloadBytes, publicKey, signature);
    }
    catch {
        valid = false;
    }
    if (!valid)
        return { ok: false, reason: "signature", message: "This serial is not valid for Rayomand themes." };

    let payload: LicensePayload;
    try {
        payload = JSON.parse(payloadBytes.toString("utf8"));
    }
    catch {
        return { ok: false, reason: "malformed", message: "The serial payload is unreadable." };
    }
    if (!payload || typeof payload.p !== "string" || typeof payload.s !== "string")
        return { ok: false, reason: "malformed", message: "The serial payload is incomplete." };

    const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
    if (payload.e && payload.e > 0 && payload.e < nowSec)
        return { ok: false, reason: "expired", message: "This license has expired." };

    if (opts.product && payload.p !== opts.product && payload.p !== "*")
        return { ok: false, reason: "product", message: "This license is for a different product." };

    if (opts.theme && payload.t && payload.t !== opts.theme)
        return { ok: false, reason: "product", message: "This license is for a different theme." };

    if (payload.h && opts.host) {
        const want = String(payload.h).toLowerCase().replace(/^www\./, "");
        const have = String(opts.host).toLowerCase().replace(/^www\./, "").split(":")[0];
        if (want !== have)
            return { ok: false, reason: "host", message: `This license is bound to ${payload.h}.` };
    }

    return {
        ok: true,
        payload,
        expiresAt: payload.e ? new Date(payload.e * 1000).toISOString() : null,
        perpetual: !payload.e,
        host: payload.h || "",
    };
}

/** Mint a serial. Only the vendor holds the private key, passed via env. */
export function mintSerial(payload: LicensePayload, privateKeyPem: string): string {
    const json = JSON.stringify(payload);
    const bytes = Buffer.from(json, "utf8");
    const key = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign(null, bytes, key);
    return `${SERIAL_PREFIX}.${b64url(bytes)}.${b64url(signature)}`;
}

export function parseSerialMetadata(serial: string): LicensePayload | null {
    const token = normalizeSerial(serial);
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== SERIAL_PREFIX)
        return null;
    try {
        return JSON.parse(fromB64url(parts[1]).toString("utf8"));
    }
    catch {
        return null;
    }
}
