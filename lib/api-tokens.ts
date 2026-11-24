import crypto from "node:crypto";
import { getDb, now } from "./db";

// Bearer tokens for the mobile app and scripted clients. A token is shown once
// at creation; only its SHA-256 hash is stored, so a database leak does not
// reveal usable tokens. Tokens are revocable and may expire.

export interface ApiToken {
    id: number;
    user_id: number;
    name: string;
    kind: string;
    scopes: string;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    created_at: string;
}

function hash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export interface IssuedToken {
    id: number;
    token: string;
}

export async function issueApiToken(input: {
    userId: number;
    name?: string;
    kind?: string;
    scopes?: string[];
    ttlDays?: number;
}): Promise<IssuedToken> {
    const raw = "rma_" + crypto.randomBytes(32).toString("base64url");
    const expires = input.ttlDays ? new Date(Date.now() + input.ttlDays * 86400_000).toISOString() : null;
    const id = (await getDb().execute(
        `INSERT INTO api_tokens (user_id,name,kind,token_hash,scopes,expires_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        input.userId, input.name || "API token", input.kind || "mobile", hash(raw),
        (input.scopes || []).join(" "), expires, now(),
    )).id;
    return { id, token: raw };
}

export async function listApiTokens(userId?: number): Promise<ApiToken[]> {
    const rows = await getDb().many(
        `SELECT id,user_id,name,kind,scopes,expires_at,revoked_at,last_used_at,created_at
         FROM api_tokens ${userId ? "WHERE user_id=$1" : ""} ORDER BY id DESC`,
        ...(userId ? [userId] : []),
    );
    return rows as ApiToken[];
}

export async function revokeApiToken(id: number, userId?: number): Promise<boolean> {
    const result = await getDb().execute(
        `UPDATE api_tokens SET revoked_at=$1 WHERE id=$2 AND revoked_at IS NULL ${userId ? "AND user_id=$3" : ""}`,
        ...(userId ? [now(), id, userId] : [now(), id]),
    );
    return result.changes > 0;
}

/** Resolve a raw bearer token to its user id, or null. Updates last_used_at. */
export async function resolveApiToken(raw: string): Promise<number | null> {
    const token = raw.trim();
    if (!token.startsWith("rma_"))
        return null;
    const row = await getDb().one(
        `SELECT id,user_id,expires_at,revoked_at FROM api_tokens WHERE token_hash=$1`,
        hash(token),
    );
    if (!row)
        return null;
    if (row.revoked_at)
        return null;
    if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now())
        return null;
    await getDb().execute("UPDATE api_tokens SET last_used_at=$1 WHERE id=$2", now(), row.id);
    return Number(row.user_id);
}
