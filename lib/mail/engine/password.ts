import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

// Mailbox passwords are hashed with scrypt. The hash string carries its own
// parameters so the cost can be raised later without invalidating old hashes.
//   scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function derive(plain: string, salt: Buffer, keylen: number, n: number, r: number, p: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCallback(plain.normalize("NFKC"), salt, keylen, { N: n, r, p, maxmem: 128 * 1024 * 1024 }, (error, key) => {
            if (error)
                reject(error);
            else
                resolve(key);
        });
    });
}

export async function hashPassword(plain: string): Promise<string> {
    if (!plain || plain.length < 8)
        throw new Error("Mailbox password must be at least 8 characters.");
    const salt = randomBytes(16);
    const hash = await derive(plain, salt, KEYLEN, N, R, P);
    return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
    if (!stored)
        return false;
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt")
        return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p))
        return false;
    let salt: Buffer;
    let expected: Buffer;
    try {
        salt = Buffer.from(parts[4], "base64");
        expected = Buffer.from(parts[5], "base64");
    }
    catch {
        return false;
    }
    let actual: Buffer;
    try {
        actual = await derive(plain, salt, expected.length, n, r, p);
    }
    catch {
        return false;
    }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
