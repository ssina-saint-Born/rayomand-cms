import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TLSSocketOptions } from "node:tls";
import { getMailSettings } from "../settings";

// Mail TLS options. The certificate is stored in settings (sealed key) by the
// ACME flow; until a real certificate exists we generate a self-signed pair at
// startup so STARTTLS is offered. Clients will warn about the self-signed
// cert, which is the correct signal that provisioning has not run yet.

let cached: { cert: string; key: string; expires: string } | null = null;
let cacheLoaded = false;

export async function currentCertificate(): Promise<{ cert: string; key: string; expires: string } | null> {
    if (cacheLoaded)
        return cached;
    const settings = await getMailSettings();
    if (settings.tls_cert && settings.tls_key) {
        cached = { cert: settings.tls_cert, key: settings.tls_key, expires: settings.tls_expires_at };
    }
    else {
        cached = generateSelfSigned(settings.mail_hostname || "localhost");
    }
    cacheLoaded = true;
    return cached;
}

export function invalidateCertificateCache(): void {
    cacheLoaded = false;
    cached = null;
}

export async function loadTlsOptions(): Promise<TLSSocketOptions | null> {
    const cert = await currentCertificate();
    if (!cert)
        return null;
    return {
        cert: cert.cert,
        key: cert.key,
        minVersion: "TLSv1.2",
    };
}

// Generate a throwaway certificate with OpenSSL. Each mail server gets one at
// first start; it is replaced as soon as ACME succeeds.
function generateSelfSigned(hostname: string): { cert: string; key: string; expires: string } | null {
    const dir = mkdtempSync(path.join(tmpdir(), "rm-cert-"));
    try {
        const keyPath = path.join(dir, "key.pem");
        const certPath = path.join(dir, "cert.pem");
        const san = hostname === "localhost" ? "DNS:localhost,IP:127.0.0.1" : `DNS:${hostname}`;
        execFileSync("openssl", [
            "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", keyPath, "-out", certPath, "-days", "30",
            "-subj", `/CN=${hostname}`,
            "-addext", `subjectAltName=${san}`,
        ], { stdio: "ignore" });
        const cert = readFileSync(certPath, "utf8");
        const key = readFileSync(keyPath, "utf8");
        const expires = new Date(Date.now() + 30 * 86400_000).toISOString();
        return { cert, key, expires };
    }
    catch {
        return null;
    }
    finally {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}
