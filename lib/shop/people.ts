import { getDb, now, withTransaction } from "../db";
import { parseJson } from "./core";
import { refreshRating } from "./products";
// ---- Customers ----
export async function listCustomers(q: {
    search?: string;
} = {}) {
    const db = getDb();
    const where = ["u.role IN ('customer','subscriber')"];
    const params: unknown[] = [];
    if (q.search) {
        where.push(`(u.username LIKE $${params.length + 1} OR u.email LIKE $${params.length + 2} OR u.display_name LIKE $${params.length + 3})`);
        const s = `%${q.search}%`;
        params.push(s, s, s);
    }
    const rows = (await db.many(`SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at FROM users u WHERE ${where.join(" AND ")} ORDER BY u.id`, ...params));
    return (await Promise.all(rows.map(async (u: any) => {
        const stats = (await db.one("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE customer_id=$1 AND status IN ('processing','completed')", u.id)) as any;
        const profile = (await db.one("SELECT billing, shipping FROM customer_profiles WHERE user_id=$1", u.id));
        return {
            ...u, order_count: stats.c, total_spent: Number(stats.s),
            billing: profile ? parseJson(profile.billing, {}) : {},
            shipping: profile ? parseJson(profile.shipping, {}) : {},
        };
    })));
}
export async function getCustomerProfile(userId: number) {
    const row = (await getDb().one("SELECT * FROM customer_profiles WHERE user_id=$1", userId));
    return { billing: row ? parseJson(row.billing, {}) : {}, shipping: row ? parseJson(row.shipping, {}) : {} };
}
export async function saveCustomerProfile(userId: number, billing: any, shipping: any) {
    return withTransaction(async () => {
        const db = getDb();
        const existing = (await db.one("SELECT user_id FROM customer_profiles WHERE user_id=$1", userId));
        const cur = (await getCustomerProfile(userId));
        const b = JSON.stringify(billing ?? cur.billing);
        const s = JSON.stringify(shipping ?? cur.shipping);
        if (existing)
            (await db.execute("UPDATE customer_profiles SET billing=$1, shipping=$2 WHERE user_id=$3", b, s, userId));
        else
            (await db.execute("INSERT INTO customer_profiles (user_id,billing,shipping) VALUES ($1,$2,$3)", userId, b, s));
        return (await getCustomerProfile(userId));
    });
}
// ---- Reviews ----
export async function listReviews(q: {
    productId?: number;
    status?: string;
} = {}) {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.productId) {
        where.push(`r.product_id=$${params.length + 1}`);
        params.push(q.productId);
    }
    if (q.status && q.status !== "any") {
        where.push(`r.status=$${params.length + 1}`);
        params.push(q.status);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return (await db.many(`SELECT r.*, p.name AS product_name FROM reviews r LEFT JOIN products p ON p.id=r.product_id ${whereSql} ORDER BY r.created_at DESC`, ...params));
}
export async function addReview(input: {
    productId: number;
    userId?: number;
    authorName: string;
    authorEmail: string;
    rating: number;
    content: string;
}) {
    return withTransaction(async () => {
        const db = getDb();
        const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 5)));
        if (!input.content.trim())
            throw new Error("Review text is required.");
        const verified = input.userId
            ? !!(await db.one("SELECT o.id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.customer_id=$1 AND i.product_id=$2 AND o.status IN ('processing','completed') LIMIT 1", input.userId, input.productId))
            : false;
        const r = (await db.execute("INSERT INTO reviews (product_id,user_id,author_name,author_email,rating,content,status,verified,created_at) VALUES ($1,$2,$3,$4,$5,$6, 'approved',$7,$8) RETURNING id", input.productId, input.userId || 0, input.authorName, input.authorEmail, rating, input.content.trim(), verified ? 1 : 0, now()));
        (await refreshRating(input.productId));
        return (await db.one("SELECT * FROM reviews WHERE id=$1", Number(r.id)));
    });
}
export async function setReviewStatus(id: number, status: string) {
    return withTransaction(async () => {
        const db = getDb();
        const row = (await db.one("SELECT * FROM reviews WHERE id=$1", id));
        if (!row)
            throw new Error("Review not found.");
        (await db.execute("UPDATE reviews SET status=$1 WHERE id=$2", status, id));
        (await refreshRating(row.product_id));
    });
}
export async function deleteReview(id: number) {
    return withTransaction(async () => {
        const db = getDb();
        const row = (await db.one("SELECT * FROM reviews WHERE id=$1", id));
        if (row) {
            (await db.execute("DELETE FROM reviews WHERE id=$1", id));
            (await refreshRating(row.product_id));
        }
    });
}
// ---- Newsletter subscribers ----
export async function listSubscribers() {
    return (await getDb().many("SELECT * FROM subscribers ORDER BY id DESC"));
}
export async function subscribe(email: string, name: string, source: string): Promise<{
    ok: boolean;
    error?: string;
    already?: boolean;
}> {
    const clean = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
        return { ok: false, error: "invalid" };
    const db = getDb();
    const existing = (await db.one("SELECT * FROM subscribers WHERE email=$1", clean));
    if (existing) {
        if (existing.subscribed)
            return { ok: true, already: true };
        (await db.execute("UPDATE subscribers SET subscribed=1 WHERE email=$1", clean));
        return { ok: true };
    }
    (await db.execute("INSERT INTO subscribers (email,name,source,subscribed,created_at) VALUES ($1,$2,$3,1,$4) RETURNING id", clean, name || "", source, now()));
    return { ok: true };
}
export async function unsubscribe(email: string) {
    (await getDb().execute("UPDATE subscribers SET subscribed=0 WHERE email=$1", String(email).trim().toLowerCase()));
}
export async function deleteSubscriber(id: number) {
    (await getDb().execute("DELETE FROM subscribers WHERE id=$1", id));
}
export { deliverEmail as sendEmail } from "../mail";
export async function listEmails() {
    return (await getDb().many("SELECT * FROM email_log ORDER BY id DESC LIMIT 200"));
}
