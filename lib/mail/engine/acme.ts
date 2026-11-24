import { createHash, createPrivateKey, createSign, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getMailSettings, saveTlsCertificate, logMailEvent } from "../settings";
import { providerFor, type DnsProvider } from "../dns";
import { invalidateCertificateCache } from "./tls";

// ACME v2 client with DNS-01 validation. No third-party dependencies: the JWS
// signing, account handling and CSR generation are done with node:crypto and
// the system openssl binary. DNS-01 is the only challenge type because the mail
// host usually cannot serve HTTP on port 80.

export interface IssueOptions {
    directoryUrl?: string;
    domains?: string[];
    email?: string;
    staging?: boolean;
    provider?: DnsProvider;
}

export interface IssueResult {
    ok: boolean;
    domains: string[];
    expires?: string;
    message: string;
}

const PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory";
const STAGING = "https://acme-staging-v02.api.letsencrypt.org/directory";

function b64url(input: Buffer | string): string {
    return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function thumbprint(publicKeyJwk: Record<string, string>): string {
    const ordered = JSON.stringify({
        e: publicKeyJwk.e,
        kty: publicKeyJwk.kty,
        n: publicKeyJwk.n,
    });
    return b64url(createHash("sha256").update(ordered).digest());
}

interface AccountKey {
    privateKeyPem: string;
    jwk: Record<string, string>;
}

function newAccountKey(): AccountKey {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
    return { privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), jwk };
}

function signJws(key: AccountKey, url: string, payload: string | null, nonce: string, kid?: string): string {
    const header: Record<string, string> = { alg: "RS256", nonce, url };
    if (kid)
        header.kid = kid;
    else
        header.jwk = key.jwk as any;
    const protectedPart = b64url(JSON.stringify(header));
    const payloadPart = payload === null ? "" : b64url(payload);
    const signer = createSign("RSA-SHA256");
    signer.update(`${protectedPart}.${payloadPart}`);
    const signature = signer.sign(createPrivateKey(key.privateKeyPem));
    return JSON.stringify({ protected: protectedPart, payload: payloadPart, signature: b64url(signature) });
}

interface AcmeResponse {
    status: number;
    body: any;
    headers: Headers;
}

async function acmeFetch(url: string, init: RequestInit): Promise<AcmeResponse> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/jose+json", ...(init.headers || {}) }, cache: "no-store" });
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* non-json */ }
    return { status: res.status, body, headers: res.headers };
}

function problem(response: AcmeResponse): string {
    const detail = response.body?.detail || response.body?.type || "";
    return detail || `ACME HTTP ${response.status}`;
}

// Build a certificate signing request with openssl, returning both the CSR
// (DER, base64url) and the private key for the issued certificate.
function buildCsr(domains: string[]): { csrDerB64: string; keyPem: string } {
    const dir = mkdtempSync(path.join(tmpdir(), "rm-acme-"));
    try {
        const keyPath = path.join(dir, "key.pem");
        const csrPath = path.join(dir, "req.csr");
        const confPath = path.join(dir, "req.cnf");
        const altNames = domains.map((d, i) => `DNS.${i + 1} = ${d}`).join("\n");
        writeFileSync(confPath, [
            "[req]",
            "distinguished_name = dn",
            "req_extensions = ext",
            "prompt = no",
            "[dn]",
            `CN = ${domains[0]}`,
            "[ext]",
            "subjectAltName = @alt",
            "[alt]",
            altNames,
        ].join("\n"));
        execFileSync("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", csrPath, "-config", confPath], { stdio: "ignore" });
        const der = execFileSync("openssl", ["req", "-in", csrPath, "-outform", "DER"], { stdio: ["ignore", "pipe", "ignore"] });
        return { csrDerB64: b64url(der), keyPem: readFileSync(keyPath, "utf8") };
    }
    finally {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

async function waitForAuthorization(
    url: string,
    post: (url: string, payload: any) => Promise<AcmeResponse>,
    deadlineMs: number,
): Promise<void> {
    while (Date.now() < deadlineMs) {
        const res = await post(url, null);
        const status = res.body?.status;
        if (status === "valid")
            return;
        if (status === "invalid")
            throw new Error(res.body?.challenges?.find((c: any) => c.error)?.error?.detail || "DNS-01 validation failed. Check the TXT record and propagation.");
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("Timed out waiting for DNS-01 validation.");
}

export async function issueCertificate(options: IssueOptions = {}): Promise<IssueResult> {
    const settings = await getMailSettings();
    if (!settings.mail_hostname)
        return { ok: false, domains: [], message: "Set the mail hostname before requesting a certificate." };

    const domains = (options.domains && options.domains.length ? options.domains : [settings.mail_hostname]).map((d) => d.toLowerCase().trim());
    const directoryUrl = options.directoryUrl || (options.staging ? STAGING : PRODUCTION);

    const provider: DnsProvider | null = options.provider ?? providerFor(settings);
    if (!provider)
        return { ok: false, domains, message: "Configure a DNS provider and API token so DNS-01 challenges can be published." };

    const account = newAccountKey();
    let nonce = "";

    async function getNonce(): Promise<string> {
        if (nonce)
            return nonce;
        const head = await fetch(directoryUrl, { method: "HEAD", cache: "no-store" });
        return head.headers.get("replay-nonce") || "";
    }
    async function signedPost(url: string, payload: any, useKid: boolean): Promise<AcmeResponse> {
        const currentNonce = await getNonce();
        const kid = useKid ? accountKid : undefined;
        const res = await acmeFetch(url, { method: "POST", body: signJws(account, url, payload === null ? null : JSON.stringify(payload), currentNonce, kid) });
        nonce = res.headers.get("replay-nonce") || "";
        return res;
    }

    const dirRes = await fetch(directoryUrl, { cache: "no-store" });
    const directory = await dirRes.json() as any;
    if (!directory?.newNonce || !directory?.newOrder)
        return { ok: false, domains, message: "The ACME directory response was not understood." };

    // 1. Register (or look up) the account.
    let accountKid = "";
    const newAccount = await signedPost(directory.newAccount, { termsOfServiceAgreed: true, contact: options.email ? [`mailto:${options.email}`] : undefined }, false);
    if (newAccount.status >= 400 && newAccount.status !== 200)
        return { ok: false, domains, message: problem(newAccount) };
    accountKid = String(newAccount.headers.get("location") || "");
    if (!accountKid)
        return { ok: false, domains, message: "ACME did not return an account URL." };

    // 2. Create the order.
    const order = await signedPost(directory.newOrder, { identifiers: domains.map((d) => ({ type: "dns", value: d })) }, true);
    if (order.status >= 400)
        return { ok: false, domains, message: problem(order) };
    const orderUrl = String(order.headers.get("location") || "");
    if (!orderUrl)
        return { ok: false, domains, message: "ACME did not return an order URL." };

    const created: Array<{ zoneId: string; remoteId: string; fqdn: string }> = [];
    try {
        // 3. Publish one TXT record per authorization.
        for (const authzUrl of order.body.authorizations || []) {
            const authzRes = await signedPost(authzUrl, null, true);
            const authz = authzRes.body;
            const identifier = String(authz?.identifier?.value || "");
            const challenge = (authz?.challenges || []).find((c: any) => c.type === "dns-01");
            if (!challenge)
                return { ok: false, domains, message: `No DNS-01 challenge offered for ${identifier}.` };

            const keyAuth = `${challenge.token}.${thumbprint(account.jwk)}`;
            const txtValue = b64url(createHash("sha256").update(keyAuth).digest());
            const recordName = `_acme-challenge.${identifier}`;

            const zone = await provider.findZone(identifier);
            if (!zone)
                return { ok: false, domains, message: `DNS zone for ${identifier} was not found in the provider account.` };
            const remoteId = await provider.createRecord(zone.id, { record_type: "TXT", name: recordName, content: txtValue, ttl: 60 });
            created.push({ zoneId: zone.id, remoteId, fqdn: recordName });

            const ready = await signedPost(challenge.url, {}, true);
            if (ready.status >= 400)
                return { ok: false, domains, message: problem(ready) };
        }

        // 4. Let the records propagate, then poll each authorization.
        await new Promise((r) => setTimeout(r, 10_000));
        for (const authzUrl of order.body.authorizations || []) {
            await waitForAuthorization(authzUrl, (url, payload) => signedPost(url, payload, true), Date.now() + 120_000);
        }

        // 5. Finalise with a CSR and fetch the certificate.
        const { csrDerB64, keyPem } = buildCsr(domains);
        const finalize = await signedPost(order.body.finalize, { csr: csrDerB64 }, true);
        if (finalize.status >= 400)
            return { ok: false, domains, message: problem(finalize) };

        let orderStatus = finalize.body?.status;
        let certificateUrl = finalize.body?.certificate;
        const deadline = Date.now() + 120_000;
        while (orderStatus !== "valid" && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000));
            const poll = await signedPost(orderUrl, null, true).catch(() => null);
            if (poll) {
                orderStatus = poll.body?.status;
                certificateUrl = poll.body?.certificate || certificateUrl;
            }
            if (orderStatus === "invalid")
                return { ok: false, domains, message: "The certificate order was rejected after finalisation." };
        }
        if (!certificateUrl)
            return { ok: false, domains, message: "The ACME order never produced a certificate." };

        const certRes = await signedPost(certificateUrl, null, true);
        const chain = typeof certRes.body === "string" ? certRes.body : "";
        if (!chain.includes("BEGIN CERTIFICATE"))
            return { ok: false, domains, message: "The certificate download was empty." };

        const expires = readCertificateExpiry(chain);
        await saveTlsCertificate(chain, keyPem, expires);
        invalidateCertificateCache();
        await logMailEvent("tls", "Certificate issued", { domains, expires, staging: !!options.staging });
        return { ok: true, domains, expires, message: `Certificate issued for ${domains.join(", ")}.` };
    }
    catch (error) {
        await logMailEvent("tls", "Certificate request failed", (error as Error).message, "error");
        return { ok: false, domains, message: (error as Error).message };
    }
    finally {
        // Challenge records are single-use; always clean them up.
        for (const record of created) {
            try { await provider.deleteRecord(record.zoneId, record.remoteId); } catch { /* best effort */ }
        }
    }
}

// Read notAfter from the leaf certificate using openssl.
function readCertificateExpiry(chainPem: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), "rm-cert-"));
    try {
        const leafPath = path.join(dir, "leaf.pem");
        writeFileSync(leafPath, chainPem);
        const out = execFileSync("openssl", ["x509", "-in", leafPath, "-noout", "-enddate"], { encoding: "utf8" });
        const match = /notAfter=(.+)/.exec(out);
        if (match) {
            const date = new Date(match[1].trim());
            if (!Number.isNaN(date.getTime()))
                return date.toISOString();
        }
        return new Date(Date.now() + 90 * 86400_000).toISOString();
    }
    catch {
        return new Date(Date.now() + 90 * 86400_000).toISOString();
    }
    finally {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}
