import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";

// Mirrors the auth helpers\IP::get(): resolve the real client IP honoring the
// X-Forwarded-For chain only for trusted proxies. Returns null when not a
// valid IP or when it matches a trusted proxy.
//
// Next.js does not expose the socket peer address, so when no proxy header is
// present we bind the OTP/rate-limit scope to a signed HttpOnly client token.
// That keeps the anti-abuse and OTP/IP-binding guarantees working on direct
// (non-proxied) deployments instead of failing open.
const TRUSTED_PROXIES: string[] = [];
const CLIENT_COOKIE = "access_client";

function isValidIp(ip: string): boolean {
    const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (v4.test(ip)) {
        const parts = ip.split(".").map(Number);
        return parts.every((p) => p >= 0 && p <= 255);
    }
    return /^[0-9a-fA-F:]+$/.test(ip);
}

function clientToken(): string | null {
    try {
        const jar = cookies();
        const existing = jar.get(CLIENT_COOKIE)?.value;
        if (existing && /^[a-f0-9]{64}$/.test(existing))
            return "c:" + existing;
        const token = randomBytes(32).toString("hex");
        jar.set(CLIENT_COOKIE, token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 400 * 86400,
        });
        return "c:" + token;
    }
    catch {
        return null;
    }
}

export async function getClientIp(): Promise<string | null> {
    const h = await headersSafe();
    const forw = h?.get("x-forwarded-for");
    if (forw) {
        const first = forw.split(",")[0].trim();
        if (first && isValidIp(first) && !TRUSTED_PROXIES.includes(first))
            return first;
        return null;
    }
    const real = h?.get("x-real-ip");
    if (real && isValidIp(real) && !TRUSTED_PROXIES.includes(real))
        return real;
    return clientToken();
}

async function headersSafe(): Promise<Headers | null> {
    try {
        const { headers } = await import("next/headers");
        return await headers();
    }
    catch {
        return null;
    }
}

// Stable, non-reversible label for a resolved scope (used in exports/logs).
export function scopeLabel(scope: string | null): string {
    if (!scope)
        return "-";
    if (scope.startsWith("c:"))
        return "device-" + createHash("sha256").update(scope).digest("hex").slice(0, 12);
    return scope;
}
