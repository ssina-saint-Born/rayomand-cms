import { getDb, now } from "./db";
import type { Comment } from "./types";
export async function listComments(opts: {
    status?: string;
    postId?: number;
    page?: number;
    perPage?: number;
}): Promise<{
    items: Comment[];
    total: number;
}> {
    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];
    if (opts.status && opts.status !== "all") {
        where.push(`c.status=$${params.length + 1}`);
        params.push(opts.status);
    }
    if (opts.postId) {
        where.push(`c.post_id=$${params.length + 1}`);
        params.push(opts.postId);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = ((await db.one(`SELECT COUNT(*) AS c FROM comments c ${whereSql}`, ...params)) as {
        c: number;
    }).c;
    const perPage = opts.perPage ?? 20;
    const page = Math.max(1, opts.page ?? 1);
    const rows = (await db.many(`SELECT c.*, p.title AS post_title FROM comments c LEFT JOIN posts p ON p.id=c.post_id ${whereSql} ORDER BY c.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, ...params, perPage, (page - 1) * perPage)) as Comment[];
    return { items: rows, total };
}
export async function getComment(id: number): Promise<Comment | null> {
    const r = (await getDb().one("SELECT c.*, p.title AS post_title FROM comments c LEFT JOIN posts p ON p.id=c.post_id WHERE c.id=$1", id)) as Comment | undefined;
    return r ?? null;
}
export async function approvedForPost(postId: number): Promise<Comment[]> {
    return (await getDb().many("SELECT * FROM comments WHERE post_id=$1 AND status='approved' ORDER BY id ASC", postId)) as Comment[];
}
export async function createComment(data: {
    post_id: number;
    user_id?: number | null;
    author_name: string;
    author_email: string;
    author_url?: string;
    content: string;
    status?: string;
    parent_id?: number;
}): Promise<number> {
    const r = (await getDb().execute("INSERT INTO comments (post_id,user_id,author_name,author_email,author_url,content,status,parent_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", data.post_id, data.user_id ?? null, data.author_name, data.author_email, data.author_url || "", data.content, data.status || "pending", data.parent_id || 0, now()));
    // A comment awaiting moderation is a to-do for editors in the mobile app.
    if ((data.status || "pending") === "pending") {
        void import("./notifications").then((m) => m.emitNotification({
            kind: "comment",
            level: "info",
            title: `New comment from ${data.author_name || "a visitor"}`,
            body: data.content.slice(0, 120),
            url: `/studio/comments`,
            dedupeKey: `comment-pending:${r.id}`,
        })).catch(() => { });
    }
    return Number(r.id);
}
export async function setCommentStatus(id: number, status: string): Promise<void> {
    (await getDb().execute("UPDATE comments SET status=$1 WHERE id=$2", status, id));
}
export async function deleteComment(id: number): Promise<void> {
    (await getDb().execute("DELETE FROM comments WHERE id=$1", id));
}
export async function countByStatus(): Promise<Record<string, number>> {
    const rows = (await getDb().many("SELECT status, COUNT(*) AS c FROM comments GROUP BY status")) as {
        status: string;
        c: number;
    }[];
    const out: Record<string, number> = {};
    for (const r of rows)
        out[r.status] = r.c;
    return out;
}
export async function recentComments(limit = 5): Promise<Comment[]> {
    return (await getDb().many("SELECT c.*, p.title AS post_title FROM comments c LEFT JOIN posts p ON p.id=c.post_id ORDER BY c.id DESC LIMIT $1", limit)) as Comment[];
}
