import { getDb } from "../db";
import { round2 } from "./core";
const PAID_SQL = "status IN ('processing','completed','refunded')";
export async function salesSummary(days = 30) {
    const db = getDb();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const agg = (await db.one(`SELECT COUNT(*) c, COALESCE(SUM(total),0) gross, COALESCE(SUM(refunded_total),0) refunds, COALESCE(SUM(shipping_total),0) shipping, COALESCE(SUM(discount_total),0) discounts FROM orders WHERE ${PAID_SQL} AND created_at>=$1`, since)) as any;
    const items = (await db.one(`SELECT COALESCE(SUM(i.quantity),0) q FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.${PAID_SQL} AND o.created_at>=$1`, since)) as any;
    const orders = agg.c || 0;
    const net = round2(Number(agg.gross) - Number(agg.refunds));
    return {
        days, orders, items_sold: items.q || 0,
        gross_sales: round2(Number(agg.gross)), net_sales: net,
        refunds: round2(Number(agg.refunds)), shipping: round2(Number(agg.shipping)), discounts: round2(Number(agg.discounts)),
        average_order: orders ? round2(net / orders) : 0,
    };
}
export async function dailySeries(days = 30, table: "orders" | "downloads" = "orders") {
    const db = getDb();
    const out: {
        date: string;
        orders: number;
        sales: number;
        downloads: number;
    }[] = [];
    const byDate = new Map<string, {
        orders: number;
        sales: number;
        downloads: number;
    }>();
    if (table === "orders") {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        for (const r of (await db.many(`SELECT substr(created_at,1,10) d, COUNT(*) c, COALESCE(SUM(total-refunded_total),0) s FROM orders WHERE ${PAID_SQL} AND created_at>=$1 GROUP BY d`, since))) {
            byDate.set(r.d, { orders: r.c, sales: round2(Number(r.s)), downloads: 0 });
        }
    }
    const sinceD = new Date(Date.now() - days * 86400000).toISOString();
    const dl = new Map<string, number>();
    for (const r of (await db.many("SELECT substr(created_at,1,10) d, COUNT(*) c FROM downloads WHERE created_at>=$1 GROUP BY d", sinceD)))
        dl.set(r.d, r.c);
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const v = byDate.get(d) || { orders: 0, sales: 0, downloads: 0 };
        out.push({ date: d, orders: v.orders, sales: v.sales, downloads: dl.get(d) || 0 });
    }
    return out;
}
export async function topProducts(limit = 7) {
    return (await getDb().many(`SELECT p.id, p.name, SUM(i.quantity) qty, SUM(i.total) sales FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id WHERE o.${PAID_SQL} GROUP BY p.id ORDER BY sales DESC LIMIT $1`, limit)).map((r: any) => ({ ...r, qty: Number(r.qty), sales: round2(Number(r.sales)) }));
}
export async function topDownloads(limit = 7) {
    return (await getDb().many("SELECT p.id, p.name, COUNT(d.id) downloads FROM downloads d JOIN products p ON p.id=d.product_id GROUP BY p.id ORDER BY downloads DESC LIMIT $1", limit));
}
export async function orderStatusCounts() {
    const rows = (await getDb().many("SELECT status, COUNT(*) c FROM orders GROUP BY status"));
    const map: Record<string, number> = {};
    for (const r of rows)
        map[r.status] = r.c;
    return map;
}
export async function categorySales() {
    return (await getDb().many(`SELECT t.name, COALESCE(SUM(i.total),0) sales, COALESCE(SUM(i.quantity),0) qty
     FROM order_items i JOIN orders o ON o.id=i.order_id
     JOIN term_relationships r ON r.post_id=i.product_id JOIN terms t ON t.id=r.term_id AND t.taxonomy='product_cat'
     WHERE o.${PAID_SQL} GROUP BY t.id ORDER BY sales DESC`)).map((r: any) => ({ ...r, sales: round2(Number(r.sales)), qty: Number(r.qty) }));
}
export async function downloadStatsSummary(days = 30) {
    const db = getDb();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const total = ((await db.one("SELECT COUNT(*) c FROM downloads")) as any).c;
    const period = ((await db.one("SELECT COUNT(*) c FROM downloads WHERE created_at>=$1", since)) as any).c;
    const unique = ((await db.one("SELECT COUNT(DISTINCT CASE WHEN user_id>0 THEN 'u'||user_id ELSE 'e'||email END) c FROM downloads WHERE created_at>=$1", since)) as any).c;
    const byMethod = (await db.many("SELECT method, COUNT(*) c FROM downloads WHERE created_at>=$1 GROUP BY method", since));
    return { total, period, unique, byMethod };
}
export async function downloadsCsv(): Promise<string> {
    const rows = (await getDb().many("SELECT d.id, d.created_at, p.name AS product, d.email, u.username, d.method, d.ip FROM downloads d LEFT JOIN products p ON p.id=d.product_id LEFT JOIN users u ON u.id=d.user_id ORDER BY d.id DESC"));
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = "id,date,product,email,user,method,ip";
    return [head, ...rows.map((r: any) => [r.id, r.created_at, r.product, r.email, r.username || "", r.method, r.ip].map(esc).join(","))].join("\n");
}
export async function ordersCsv(): Promise<string> {
    const rows = (await getDb().many("SELECT number, created_at, status, total, refunded_total, payment_method_title, billing FROM orders ORDER BY id DESC"));
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = "number,date,status,total,refunded,payment,customer_email";
    return [head, ...rows.map((r: any) => {
            let email = "";
            try {
                email = JSON.parse(r.billing).email || "";
            }
            catch { }
            return [r.number, r.created_at, r.status, r.total, r.refunded_total, r.payment_method_title, email].map(esc).join(",");
        })].join("\n");
}
