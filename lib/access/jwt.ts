import { createHmac, timingSafeEqual } from "node:crypto";

// Mirrors the auth helpers\JWT: compact HMAC-SHA256 JWT with exp claim. The
// secret is derived from an env AUTH_KEY (falling back to a hash of DB creds),
// exactly as the plugin uses WP AUTH_KEY with a DB-credential fallback.
const ALGORITHM = "sha256";
export const DEFAULT_TTL = 180; // seconds

function getSecret(): string {
    const auth = process.env.ACCESS_AUTH_KEY || process.env.AUTH_KEY;
    if (auth && auth !== "put your unique phrase here")
        return auth;
    const url = process.env.DATABASE_URL || "";
    return createHmac("sha256", "sentinel-jwt").update(url).digest("hex");
}

function b64encode(input: string): string {
    return Buffer.from(input, "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64encodeBytes(buf: Buffer): string {
    return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64decode(input: string): string {
    let s = input.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4)
        s += "=";
    return Buffer.from(s, "base64").toString("utf8");
}

function b64decodeBytes(input: string): Buffer {
    let s = input.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4)
        s += "=";
    return Buffer.from(s, "base64");
}

export function jwtEncode(payload: Record<string, any>, ttl: number | null = null): string {
    const exp = Math.floor(Date.now() / 1000) + (ttl || DEFAULT_TTL);
    const body = { ...payload, exp };
    const header = { typ: "JWT", alg: ALGORITHM };
    const headerEncoded = b64encode(JSON.stringify(header));
    const payloadEncoded = b64encode(JSON.stringify(body));
    const signature = createHmac(ALGORITHM, getSecret())
        .update(`${headerEncoded}.${payloadEncoded}`)
        .digest();
    const signatureEncoded = b64encodeBytes(signature);
    return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

export function jwtDecode(token: string): Record<string, any> {
    const parts = String(token || "").split(".");
    if (parts.length !== 3)
        throw new Error("Invalid JWT format");
    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    const header = JSON.parse(b64decode(headerEncoded));
    const payload = JSON.parse(b64decode(payloadEncoded));
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object")
        throw new Error("Invalid JWT encoding");
    const expected = createHmac(ALGORITHM, getSecret())
        .update(`${headerEncoded}.${payloadEncoded}`)
        .digest();
    const expectedSig = b64encodeBytes(expected);
    if (expectedSig.length !== signatureEncoded.length || !timingSafeEqual(Buffer.from(expectedSig, "utf8"), Buffer.from(signatureEncoded, "utf8")))
        throw new Error("Invalid signature");
    if (typeof payload.exp === "number" && Math.floor(Date.now() / 1000) >= payload.exp)
        throw new Error("Token expired");
    return payload;
}