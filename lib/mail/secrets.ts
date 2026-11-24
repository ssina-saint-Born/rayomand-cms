import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(material: string): Buffer {
    return createHash("sha256").update("mail-envelope:" + material).digest();
}

function secretMaterials(): string[] {
    const primary = process.env.MAIL_SECRET_KEY || process.env.MAIL_SESSION_SECRET;
    if (!primary)
        throw new Error("MAIL_SESSION_SECRET is required for encrypted mail settings.");
    return [primary, process.env.SETUP_TOKEN || "", process.env.DATABASE_URL || "", "rayomand-mail"].filter(Boolean);
}

export function sealSecret(plain: string): string {
    if (!plain)
        return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(secretMaterials()[0]), iv);
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
    const materials = new Set<string>([
        process.env.MAIL_SECRET_KEY || process.env.MAIL_SESSION_SECRET || "",
        process.env.SETUP_TOKEN || "",
        process.env.DATABASE_URL || "",
        "rayomand-mail",
    ]);
    for (const material of materials) {
        if (!material)
            continue;
        try {
            const iv = Buffer.from(parts[1], "base64");
            const tag = Buffer.from(parts[2], "base64");
            const data = Buffer.from(parts[3], "base64");
            const decipher = createDecipheriv("aes-256-gcm", key(material), iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
        }
        catch {
            continue;
        }
    }
    return "";
}
