import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth";
import { Readable } from "node:stream";

// DKIM for outgoing mail. Keys are RSA-2048: universally understood by the
// large providers, and small enough that signing costs a few milliseconds.

export interface DkimKeyPair {
    selector: string;
    privateKey: string;
    publicKey: string;
    dnsValue: string;
}

export function generateDkimKey(selector = "mail"): DkimKeyPair {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return {
        selector,
        privateKey,
        publicKey,
        dnsValue: buildDnsValue(publicKey),
    };
}

// DNS TXT value: v=DKIM1; k=rsa; p=<base64 SPKI without PEM armour>
export function buildDnsValue(publicKeyPem: string): string {
    const body = publicKeyPem
        .replace(/-----BEGIN PUBLIC KEY-----/, "")
        .replace(/-----END PUBLIC KEY-----/, "")
        .replace(/\s+/g, "");
    return `v=DKIM1; k=rsa; p=${body}`;
}

// RFC 6376 recommends signing these headers. Keep the list deterministic so a
// re-signed message verifies identically.
const SIGNED_HEADERS = [
    "from", "to", "cc", "subject", "date", "message-id",
    "mime-version", "content-type", "content-transfer-encoding",
    "reply-to", "in-reply-to", "references",
];

export interface SignOptions {
    domain: string;
    selector: string;
    privateKey: string;
}

// Return the message with a DKIM-Signature header prepended. If signing fails
// for any reason the original message is returned unchanged: an unsigned
// message is better than a rejected one, and the failure is logged by caller.
export async function signMessage(raw: Buffer, opts: SignOptions): Promise<{ raw: Buffer; signed: boolean; error?: string }> {
    try {
        const result = await dkimSign(Readable.from(raw), {
            canonicalization: "relaxed/relaxed",
            algorithm: "rsa-sha256",
            signTime: new Date(),
            signatureData: [{
                signingDomain: opts.domain,
                selector: opts.selector,
                privateKey: opts.privateKey,
                canonicalization: "relaxed/relaxed",
                algorithm: "rsa-sha256",
            }],
            headerList: SIGNED_HEADERS.join(":"),
        });
        if (result.errors && result.errors.length) {
            return { raw, signed: false, error: result.errors.map((e: any) => e.message || String(e)).join("; ") };
        }
        const signatureHeaders = (result.signatures || "").trim();
        if (!signatureHeaders)
            return { raw, signed: false, error: "No DKIM signature was produced." };
        return { raw: Buffer.concat([Buffer.from(signatureHeaders + "\r\n", "utf8"), raw]), signed: true };
    }
    catch (error) {
        return { raw, signed: false, error: (error as Error).message };
    }
}
