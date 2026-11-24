import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Symmetric envelope for at-rest secrets (mailbox passwords, API tokens).
// The key is derived from the app's own secret material so nothing sensitive
// is ever written to the database in plaintext.
function key(): Buffer {
    const material = process.env.MAIL_SECRET_KEY || process.env.SETUP_TOKEN || process.env.DATABASE_URL || "rayomand-mail";
    return createHash("sha256").update("mail-envelope:" + material).digest();
}

export function sealSecret(plain: string): string {
    if (!plain)
        return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function openSecret(sealed: string): string {
    if (!sealed)
        return "";
    const parts = sealed.split(":");
    if (parts.length !== 4 || parts[0] !== "v1")
        return "";
    try {
        const iv = Buffer.from(parts[1], "base64");
        const tag = Buffer.from(parts[2], "base64");
        const data = Buffer.from(parts[3], "base64");
        const decipher = createDecipheriv("aes-256-gcm", key(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    }
    catch {
        return "";
    }
}
