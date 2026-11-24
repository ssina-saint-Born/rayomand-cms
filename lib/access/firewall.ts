import { getDb, now } from "../db";
import { getClientIp } from "./ip";

export interface BlockRow {
    id: number;
    identifier: string;
    blocked_by: number | null;
    blocked_until: string | null;
    created_at: string;
}

// Mirrors the auth services\FirewallService. A null `minutes` blocks permanently
// (blocked_until = NULL), which is how admin-added indefinite blocks are stored.
export async function block(identifier: string, minutes: number | null, blockedBy?: number): Promise<BlockRow> {
    await getDb().execute(
        `INSERT INTO access_blocks (identifier, blocked_by, blocked_until, created_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (identifier) DO UPDATE SET blocked_until=$3, blocked_by=$2`,
        identifier, blockedBy ?? null, minutes === null ? null : new Date(Date.now() + minutes * 60000).toISOString(), now(),
    );
    const row = await getDb().one("SELECT * FROM access_blocks WHERE identifier=$1", identifier);
    return row as BlockRow;
}

// Returns the active Block for an identifier, if any.
export async function isBlocked(identifier: string): Promise<BlockRow | null> {
    const row = await getDb().one(
        "SELECT * FROM access_blocks WHERE identifier=$1 AND (blocked_until IS NULL OR blocked_until > $2)",
        identifier, now(),
    );
    return (row as BlockRow) || null;
}

export async function isIpBlocked(): Promise<BlockRow | null> {
    const ip = await getClientIp();
    return ip ? isBlocked(ip) : null;
}

export async function deleteExpiredBlocks(): Promise<void> {
    await getDb().execute("DELETE FROM access_blocks WHERE blocked_until IS NOT NULL AND blocked_until < $1", now());
}

// Admin list/filter/delete for the blocks screen.
export async function listBlocks(q: {
    identifier?: string;
    fromDate?: string;
    toDate?: string;
    blockedBy?: string;
    page?: number;
    perPage?: number;
} = {}): Promise<{ blocks: BlockRow[]; total_items: number; current_page: number }> {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.identifier)
        where.push(`(identifier ILIKE $${params.push(`%${q.identifier}%`)})`);
    if (q.blockedBy) {
        const like = params.push(`%${q.blockedBy}%`);
        where.push(`blocked_by IN (SELECT id FROM users WHERE display_name ILIKE $${like} OR username ILIKE $${like})`);
    }
    if (q.fromDate)
        where.push(`blocked_until >= $${params.push(new Date(q.fromDate).toISOString())}`);
    if (q.toDate)
        where.push(`blocked_until <= $${params.push(new Date(q.toDate).toISOString())}`);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total_items = Number((await db.one(`SELECT COUNT(*) c FROM access_blocks ${whereSql}`, ...params)).c);
    const perPage = Math.min(Number(q.perPage) || 20, 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const blocks = await db.many(
        `SELECT * FROM access_blocks ${whereSql} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params, perPage, (page - 1) * perPage,
    );
    return { blocks, total_items, current_page: page };
}

export async function deleteBlock(blockId: number): Promise<boolean> {
    const row = await getDb().one("SELECT * FROM access_blocks WHERE id=$1", blockId);
    if (!row || row.blocked_by === null)
        return false; // system blocks cannot be deleted
    await getDb().execute("DELETE FROM access_blocks WHERE id=$1", blockId);
    return true;
}