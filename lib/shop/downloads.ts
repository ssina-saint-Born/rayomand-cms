import crypto from "node:crypto";
import { getDb, now, withTransaction } from "../db";
import { getDownloadsSettings, getShopSettings, parseJson } from "./core";
import { getProduct, isFreeDownloadable, ShopProduct } from "./products";
import { userOwnsProduct } from "./orders";
import { sendEmail, subscribe } from "./people";
export interface SomUser {
    id: number;
    username: string;
    email: string;
    role: string;
}
export function indyFor(productId: number, som: Record<string, any>): Record<string, any> {
    const items = som.indy_items || {};
    return items[String(productId)] || {};
}
function inList(list: any[], value: number | string): boolean {
    return (list || []).some((v) => String(v) === String(value));
}
// Global + individual include/exclude rules (downloads settings "Include/Exclude").
export function productIncluded(p: ShopProduct, som: Record<string, any>): boolean {
    if (inList(som.indy_exclude_items || [], p.id))
        return false;
    const indy = indyFor(p.id, som);
    if (indy.exclude)
        return false;
    const cats = som.included_categories || [];
    const tags = som.included_tags || [];
    const prods = som.included_products || [];
    if (!cats.length && !tags.length && !prods.length)
        return true;
    if (inList(prods, p.id))
        return true;
    if ((p.categories || []).some((c) => inList(cats, c.id)))
        return true;
    if ((p.tags || []).some((t) => inList(tags, t.id)))
        return true;
    return false;
}
export function isFreeDownloadOffer(p: ShopProduct, som: Record<string, any>): boolean {
    if (!isFreeDownloadable(p))
        return false;
    if (p.on_sale && !som.include_sale_items)
        return false;
    return productIncluded(p, som);
}
export function captureRequired(p: ShopProduct, user: SomUser | null, som: Record<string, any>): boolean {
    if (!som.capture_email_enable)
        return false;
    if (som.exclude_email_capture)
        return false;
    const indy = indyFor(p.id, som);
    if (indy.exclude_email_capture)
        return false;
    if (user && !som.capture_email_users_enable)
        return false;
    return true;
}
// ---- Limits (product > role > global basic), pro feature ----
function periodStart(freq: string): string | null {
    const d = new Date();
    switch (freq) {
        case "day":
            d.setUTCHours(0, 0, 0, 0);
            return d.toISOString();
        case "week": {
            const day = (d.getUTCDay() + 6) % 7;
            d.setUTCDate(d.getUTCDate() - day);
            d.setUTCHours(0, 0, 0, 0);
            return d.toISOString();
        }
        case "month":
            d.setUTCDate(1);
            d.setUTCHours(0, 0, 0, 0);
            return d.toISOString();
        case "year":
            d.setUTCMonth(0, 1);
            d.setUTCHours(0, 0, 0, 0);
            return d.toISOString();
        default: return null; // "all" / lifetime
    }
}
async function countDownloads(productId: number | null, user: SomUser | null, email: string, since: string | null): Promise<number> {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (productId) {
        where.push(`product_id=$${params.length + 1}`);
        params.push(productId);
    }
    if (user) {
        where.push(`user_id=$${params.length + 1}`);
        params.push(user.id);
    }
    else if (email) {
        where.push(`email=$${params.length + 1}`);
        params.push(email.toLowerCase());
    }
    else
        return 0;
    if (since) {
        where.push(`created_at>=$${params.length + 1}`);
        params.push(since);
    }
    const sql = `SELECT COUNT(*) c FROM downloads ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
    return ((await db.one(sql, ...params)) as any).c;
}
export interface LimitResult {
    active: boolean;
    allowed: boolean;
    remaining: number | null;
    amount: number;
    freq: string;
    scope: string;
    error: string;
}
export async function checkLimit(p: ShopProduct, user: SomUser | null, email: string, som: Record<string, any>): Promise<LimitResult> {
    const inactive: LimitResult = { active: false, allowed: true, remaining: null, amount: 0, freq: "", scope: "", error: "" };
    if (!som.download_limits_active)
        return inactive;
    const indy = indyFor(p.id, som);
    let amount = 0, freq = "month", scope = "", error = "";
    if (indy.limit_enable) {
        amount = Number(indy.limit_amount || 0);
        freq = indy.limit_freq || "month";
        scope = "product";
        error = indy.limit_error || som.basic_limit_error || "You have reached the download limit for this product.";
    }
    else if (user && som.role_limits?.[user.role]?.enable) {
        const rl = som.role_limits[user.role];
        amount = Number(rl.amount || 0);
        freq = rl.freq || "month";
        scope = "role";
        error = rl.error || som.basic_limit_error || "You have reached your download limit.";
    }
    else if (som.basic_limit_enable) {
        amount = Number(som.basic_limit_amount || 0);
        freq = som.basic_limit_freq || "month";
        scope = "global";
        error = som.basic_limit_error || "You have reached the download limit.";
    }
    else
        return inactive;
    if (amount <= 0)
        return inactive;
    const since = periodStart(freq);
    const used = (await countDownloads(scope === "product" ? p.id : null, user, email, since));
    const remaining = Math.max(0, amount - used);
    return { active: true, allowed: remaining > 0, remaining, amount, freq, scope, error };
}
export function limitText(limit: LimitResult, som: Record<string, any>): string {
    if (!limit.active || limit.remaining == null)
        return "";
    return String(som.available_downloads_text || "{remaining} downloads remaining this {freq}")
        .replace(/\{remaining\}/g, String(limit.remaining))
        .replace(/\{freq\}/g, limit.freq)
        .replace(/\{amount\}/g, String(limit.amount));
}
// ---- State shown on product / archive buttons ----
export interface OfferState {
    offered: boolean;
    requireLogin: boolean;
    loginMessage: string;
    capture: boolean;
    limit: LimitResult;
    limitText: string;
    owned: boolean;
    count: number;
    countText: string;
}
export async function offerState(p: ShopProduct, user: SomUser | null, som?: Record<string, any>, email = ""): Promise<OfferState> {
    const s = som ?? (await getDownloadsSettings());
    const owned = !!user && (await userOwnsProduct(user.id, p.id));
    const offered = !!(await getShopSettings()).enable_downloads && (isFreeDownloadOffer(p, s) || (!!s.include_purchased && owned && !!p.downloadable && p.status === "publish"));
    const limit = offered ? (await checkLimit(p, user, email || user?.email || "", s)) : { active: false, allowed: true, remaining: null, amount: 0, freq: "", scope: "", error: "" };
    const count = (await productDownloadCount(p.id));
    return {
        offered,
        requireLogin: offered && !!s.require_login && !user,
        loginMessage: String(s.require_login_message || "Only registered users can download this free product. Please log in or register."),
        capture: offered && captureRequired(p, user, s),
        limit,
        limitText: limitText(limit, s),
        owned,
        count,
        countText: String(s.download_counts_output_text || "{count} downloads").replace(/\{count\}/g, String(count)),
    };
}
export async function productDownloadCount(productId: number): Promise<number> {
    return ((await getDb().one("SELECT COUNT(*) c FROM downloads WHERE product_id=$1", productId)) as any).c;
}
// ---- Tracking + admin notification ----
export async function trackDownload(p: ShopProduct, user: SomUser | null, email: string, ip: string, method: string, variationId = 0) {
    const db = getDb();
    (await db.execute("INSERT INTO downloads (product_id,variation_id,user_id,email,ip,method,files,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", p.id, variationId, user?.id || 0, (email || user?.email || "").toLowerCase(), ip, method, JSON.stringify(p.files.map((f) => f.name)), now()));
    const som = (await getDownloadsSettings());
    if (som.email_new_download_enable && som.email_new_download_sendto) {
        const who = user ? user.username : email || "a guest";
        const body = String(som.email_new_download_message || "{product} was downloaded by {user}.")
            .replace(/\{product\}/g, p.name).replace(/\{user\}/g, who).replace(/\{email\}/g, email || user?.email || "");
        try {
            await sendEmail(som.email_new_download_sendto, som.email_new_download_subject || "New free download", som.email_new_download_heading || "New download", body, "new-download");
        }
        catch { }
    }
}
// ---- Email-link + redirect tokens ----
export async function createToken(p: ShopProduct, user: SomUser | null, email: string, hours: number, variationId = 0, fileIndices = p.files.map((_, i) => i)): Promise<string> {
    return withTransaction(async () => {
        const token = crypto.randomBytes(24).toString("hex");
        const expires = new Date(Date.now() + Math.max(1, hours) * 3600 * 1000).toISOString();
        (await getDb().execute("INSERT INTO download_tokens (token,product_id,variation_id,user_id,email,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", token, p.id, variationId, user?.id || 0, (email || user?.email || "").toLowerCase(), expires, now()));
        const grant = "INSERT INTO download_token_files (token,file_index) VALUES ($1,$2)";
        for (const index of Array.from(new Set(fileIndices)))
            (await getDb().execute("INSERT INTO download_token_files (token,file_index) VALUES ($1,$2)", token, index));
        return token;
    });
}
export async function peekToken(token: string) {
    const row = (await getDb().one("SELECT * FROM download_tokens WHERE token=$1", token));
    if (!row)
        return { ok: false as const, reason: "missing" };
    if (row.used_at)
        return { ok: false as const, reason: "used", row };
    if (new Date(row.expires_at) < new Date())
        return { ok: false as const, reason: "expired", row };
    const files = (await getDb().many("SELECT file_index FROM download_token_files WHERE token=$1 AND consumed_at IS NULL ORDER BY file_index", token));
    if (!files.length)
        return { ok: false as const, reason: "used", row };
    return { ok: true as const, row: { ...row, file_indices: files.map((f) => Number(f.file_index)) } };
}
export async function consumeTokenFiles(token: string, indices: number[]): Promise<boolean> {
    return withTransaction(async () => {
        const db = getDb();
        const row = await db.one("SELECT used_at,expires_at FROM download_tokens WHERE token=$1 FOR UPDATE", token);
        if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return false;
        const selected = Array.from(new Set(indices));
        const grants = await db.many("SELECT file_index FROM download_token_files WHERE token=$1 AND file_index = ANY($2::int[]) AND consumed_at IS NULL", token, selected);
        if (!selected.length || grants.length !== selected.length) return false;
        await db.execute("UPDATE download_token_files SET consumed_at=$1 WHERE token=$2 AND file_index = ANY($3::int[])", now(), token, selected);
        const remaining = (await db.one("SELECT COUNT(*) c FROM download_token_files WHERE token=$1 AND consumed_at IS NULL", token)).c;
        if (!remaining) await db.execute("UPDATE download_tokens SET used_at=$1 WHERE token=$2", now(), token);
        return true;
    });
}
export async function sendDownloadLinkEmail(p: ShopProduct, email: string, token: string, som: Record<string, any>, origin: string) {
    const link = `${origin}/files/access?token=${token}`;
    const body = String(som.email_message || "Hi there, your download of {product} is ready. Click the link below to download your files. This link expires in {expire} hours.")
        .replace(/\{product\}/g, p.name).replace(/\{link\}/g, link).replace(/\{expire\}/g, String(som.email_expire_time || 24));
    (await sendEmail(email, som.email_subject || "Your free download is ready", som.email_heading || "Your download", `${body}\n\n${link}`, "download-link"));
    return link;
}
// ---- Email capture ----
export async function captureEmail(p: ShopProduct, email: string, name: string, som: Record<string, any>): Promise<{
    ok: boolean;
    error?: string;
}> {
    const clean = String(email || "").trim();
    if (!clean)
        return { ok: false, error: String(som.capture_email_error_none || "Please enter your email address to download.") };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
        return { ok: false, error: String(som.capture_email_error_invalid || "Please enter a valid email address.") };
    if (som.capture_email_subscribe)
        (await subscribe(clean, name, `download:${p.slug}`));
    return { ok: true };
}
// ---- My account ----
export async function freeDownloadsForUser(user: SomUser | null) {
    const som = (await getDownloadsSettings());
    const db = getDb();
    const rows = (await db.many("SELECT * FROM products WHERE downloadable=1 AND status='publish' AND type!='variation' AND type!='grouped'"));
    const products = await Promise.all(rows.map((r: any) => getProduct(r.id)));
    const offers = await Promise.all(products.filter((p): p is ShopProduct => !!p).map(async (p) => ({ product: p, state: await offerState(p, user, som) })));
    return offers.filter(offer => offer.state.offered);
}
export async function downloadHistory(userId: number) {
    const hidePurchased = (await getDownloadsSettings()).download_history_hide_purchase;
    return (await getDb().many(`SELECT d.*, p.name AS product_name, p.slug AS product_slug FROM downloads d LEFT JOIN products p ON p.id=d.product_id WHERE d.user_id=$1 ${hidePurchased ? "AND COALESCE(p.price,0)<=0" : ""} ORDER BY d.id DESC LIMIT 200`, userId));
}
export async function allDownloads(q: {
    productId?: number;
    page?: number;
    perPage?: number;
} = {}) {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.productId) {
        where.push(`d.product_id=$${params.length + 1}`);
        params.push(q.productId);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = ((await db.one(`SELECT COUNT(*) c FROM downloads d ${whereSql}`, ...params)) as any).c;
    const perPage = Math.min(Number(q.perPage) || 30, 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const rows = (await db.many(`SELECT d.*, p.name AS product_name, u.username FROM downloads d LEFT JOIN products p ON p.id=d.product_id LEFT JOIN users u ON u.id=d.user_id ${whereSql} ORDER BY d.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, ...params, perPage, (page - 1) * perPage));
    return { items: rows.map((r: any) => ({ ...r, files: parseJson(r.files, []) })), total, pages: Math.max(1, Math.ceil(total / perPage)) };
}
