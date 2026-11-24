import { randomBytes } from "node:crypto";
import { getDb, now, withTransaction } from "../db";
import { getShopSettings, parseJson, round2 } from "./core";
import { adjustStock, bumpSales, getProduct } from "./products";
import { CartLine, CartTotals, cartLines, computeTotals, clearCart, getAppliedCoupon, TotalsContext } from "./cart";
export const ORDER_STATUSES = [
    { value: "pending", label: "Pending payment" },
    { value: "processing", label: "Processing" },
    { value: "on-hold", label: "On hold" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "refunded", label: "Refunded" },
    { value: "failed", label: "Failed" },
];
export const PAYMENT_METHODS = [
    { id: "cod", title: "Cash on delivery", description: "Payment is collected on delivery; this order remains unpaid until confirmed by the store." },
    { id: "bacs", title: "Direct bank transfer", description: "" },
    { id: "cheque", title: "Check payments", description: "" },
];
export async function getPaymentMethods() {
    const settings = await getShopSettings();
    return PAYMENT_METHODS.filter(method => !!settings[`payment_${method.id}_enabled`] && (method.id === "cod" || String(settings[`payment_${method.id}_instructions`] || "").trim())).map(method => ({ ...method, description: String(settings[`payment_${method.id}_instructions`] || method.description) }));
}
const PAID = new Set(["processing", "completed"]);
export async function hydrateOrder(row: any) {
    const db = getDb();
    const items = (await db.many("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id", row.id));
    const notes = (await db.many("SELECT * FROM order_notes WHERE order_id=$1 ORDER BY id DESC", row.id));
    const refunds = (await db.many("SELECT * FROM order_refunds WHERE order_id=$1 ORDER BY id DESC", row.id));
    let customer: any = null;
    if (row.customer_id) {
        customer = (await db.one("SELECT id, username, email, display_name FROM users WHERE id=$1", row.customer_id)) || null;
    }
    return {
        ...row,
        total: Number(row.total), discount_total: Number(row.discount_total), shipping_total: Number(row.shipping_total),
        cart_tax: Number(row.cart_tax), total_tax: Number(row.total_tax), refunded_total: Number(row.refunded_total),
        shipping_tax: Number(row.shipping_tax || 0),
        tax_lines: parseJson(row.tax_lines, []),
        billing: parseJson(row.billing, {}), shipping: parseJson(row.shipping, {}),
        items: items.map((i: any) => ({ ...i, subtotal: Number(i.subtotal), total: Number(i.total), tax: Number(i.tax) })),
        notes, refunds: refunds.map((r: any) => ({ ...r, amount: Number(r.amount) })),
        customer,
    };
}
export async function getOrder(idOrNumber: number | string) {
    const db = getDb();
    const row = typeof idOrNumber === "number"
        ? (await db.one("SELECT * FROM orders WHERE id=$1", idOrNumber)) : (await db.one("SELECT * FROM orders WHERE number=$1 OR id=$2", String(idOrNumber), Number(idOrNumber) || -1));
    return row ? (await hydrateOrder(row)) : null;
}
export async function listOrders(q: {
    status?: string;
    customer?: number;
    search?: string;
    page?: number;
    perPage?: number;
} = {}) {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status && q.status !== "any") {
        const statuses = q.status.split(",");
        where.push(`status IN (${statuses.map((_, i) => `$${params.length + i + 1}`).join(",")})`);
        params.push(...statuses);
    }
    if (q.customer) {
        where.push(`customer_id=$${params.length + 1}`);
        params.push(q.customer);
    }
    if (q.search) {
        where.push(`(number LIKE $${params.length + 1} OR billing LIKE $${params.length + 2})`);
        const s = `%${q.search}%`;
        params.push(s, s);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = ((await db.one(`SELECT COUNT(*) c FROM orders ${whereSql}`, ...params)) as any).c;
    const perPage = Math.min(Number(q.perPage) || 20, 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const rows = (await db.many(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, ...params, perPage, (page - 1) * perPage));
    return { items: (await Promise.all(rows.map(hydrateOrder))), total, pages: Math.max(1, Math.ceil(total / perPage)) };
}
export async function createOrder(input: {
    key: string;
    lines: CartLine[];
    totals: CartTotals;
    customerId: number;
    billing: Record<string, any>;
    shipping: Record<string, any>;
    paymentMethod: string;
    customerNote?: string;
    shippingMethod?: string;
    totalsContext?: TotalsContext;
    smsOptIn?: boolean;
}): Promise<any> {
    return withTransaction(async () => {
        const db = getDb();
        if (!input.lines.length)
            throw new Error("Your cart is empty.");
        await db.one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", `cart:${input.key}`);
        const liveLines = await cartLines(input.key);
        if (!liveLines.length)
            throw new Error("Your cart is empty.");
        await db.many("SELECT id FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE", liveLines.flatMap(line => [line.product_id, line.variation_id || line.product_id]));
        input.lines = await cartLines(input.key);
        if (!input.lines.length || input.lines.length !== liveLines.length) throw new Error("A product is no longer available.");
        for (const line of input.lines) {
            const parent = await db.one("SELECT status FROM products WHERE id=$1", line.product_id);
            if (parent?.status !== "publish" || line.product.status !== "publish") throw new Error("A product is no longer available.");
            if (line.product.stock_status === "outofstock" || (line.product.manage_stock && line.product.stock_quantity != null && line.quantity > line.product.stock_quantity)) throw new Error("Insufficient stock to fulfil this order.");
        }
        const couponCode = await getAppliedCoupon(input.key);
        if (couponCode)
            await db.one("SELECT id FROM coupons WHERE lower(code)=lower($1) FOR UPDATE", couponCode);
        // Recompute server-side from the persisted destination + method so a
        // tampered client payload can never dictate the order total.
        input.totals = await computeTotals(input.key, input.lines, input.totalsContext ?? { legacy: input.shippingMethod });
        const method = input.totals.total <= 0 ? { id: "free", title: "No payment required" } : (await getPaymentMethods()).find((m) => m.id === input.paymentMethod);
        if (!method)
            throw new Error("Invalid payment method.");
        const t = now();
        const isFree = input.totals.total <= 0;
        const status = isFree ? "completed" : "on-hold";
        const number = String((await db.one("SELECT nextval('order_number_sequence') AS number")).number);
        const r = (await db.execute("INSERT INTO orders (number,status,customer_id,billing,shipping,payment_method,payment_method_title,transaction_id,currency,discount_total,shipping_total,cart_tax,total,total_tax,customer_note,refunded_total,created_at,updated_at,paid_at,access_token,shipping_method,shipping_method_title,shipping_tax,tax_lines,sms_opt_in)\n     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id", number, status, input.customerId, JSON.stringify(input.billing), JSON.stringify(input.shipping), method.id, method.title, "", (await getShopSettings()).currency, input.totals.discount_total, input.totals.shipping_total, input.totals.tax_total, input.totals.total, input.totals.tax_total, input.customerNote || "", 0, t, t, PAID.has(status) ? t : null, randomBytes(32).toString("hex"), input.totals.shipping_label || "", input.totals.shipping_label || "", input.totals.shipping_tax || 0, JSON.stringify(input.totals.tax_lines || []), input.smsOptIn === false ? 0 : 1));
        const orderId = Number(r.id);
        const insertItem = "INSERT INTO order_items (order_id,product_id,variation_id,name,quantity,subtotal,total,tax,sku) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id";
        for (const l of input.lines) {
            const lineDiscount = input.totals.subtotal > 0 ? round2(l.line_subtotal * (input.totals.discount_total / input.totals.subtotal)) : 0;
            (await db.execute("INSERT INTO order_items (order_id,product_id,variation_id,name,quantity,subtotal,total,tax,sku) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", orderId, l.product_id, l.variation_id, l.product.name, l.quantity, l.line_subtotal, round2(l.line_subtotal - lineDiscount), 0, l.product.sku || ""));
            if (PAID.has(status)) {
                (await adjustStock(l.variation_id || l.product_id, -l.quantity));
                (await bumpSales(l.product_id, l.quantity));
            }
        }
        const appliedCode = input.totals.coupon_code;
        if (appliedCode) {
            await db.execute("UPDATE coupons SET usage_count=usage_count+1 WHERE lower(code)=lower($1)", appliedCode);
        }
        (await db.execute("INSERT INTO order_notes (order_id,author,content,is_customer_note,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id", orderId, "system", `Order status changed to ${status}. Payment method: ${method.title}.`, 0, t));
        if (input.customerId) {
            const profile = (await db.one("SELECT user_id FROM customer_profiles WHERE user_id=$1", input.customerId));
            if (profile)
                (await db.execute("UPDATE customer_profiles SET billing=$1, shipping=$2 WHERE user_id=$3", JSON.stringify(input.billing), JSON.stringify(input.shipping), input.customerId));
            else
                (await db.execute("INSERT INTO customer_profiles (user_id,billing,shipping) VALUES ($1,$2,$3)", input.customerId, JSON.stringify(input.billing), JSON.stringify(input.shipping)));
        }
        (await clearCart(input.key));
        return (await getOrder(orderId));
    });
}
export async function setOrderStatus(id: number, status: string, author = "admin") {
    return withTransaction(async () => {
        const db = getDb();
        const row = (await db.one("SELECT * FROM orders WHERE id=$1 FOR UPDATE", id));
        if (!row)
            throw new Error("Order not found.");
        if (!ORDER_STATUSES.some((s) => s.value === status))
            throw new Error("Invalid order status.");
        const wasPaid = PAID.has(row.status);
        const isPaid = PAID.has(status);
        const t = now();
        (await db.execute("UPDATE orders SET status=$1, updated_at=$2, paid_at=$3 WHERE id=$4", status, t, isPaid && !row.paid_at ? t : row.paid_at, id));
        if (!wasPaid && isPaid) {
            for (const i of (await db.many("SELECT * FROM order_items WHERE order_id=$1", id))) {
                (await adjustStock(i.variation_id || i.product_id, -Number(i.quantity)));
                (await bumpSales(i.product_id, Number(i.quantity)));
            }
        }
        else if (wasPaid && !isPaid) {
            for (const i of (await db.many("SELECT * FROM order_items WHERE order_id=$1", id))) {
                (await adjustStock(i.variation_id || i.product_id, Number(i.quantity)));
                (await bumpSales(i.product_id, -Number(i.quantity)));
            }
        }
        (await db.execute("INSERT INTO order_notes (order_id,author,content,is_customer_note,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id", id, author, `Order status changed from ${row.status} to ${status}.`, 0, t));
        // Surface status changes in the mobile notification feed. Dynamic import
        // keeps this module free of a startup dependency on the SMS stack.
        void import("../notifications").then((m) => m.emitNotification({
            kind: "order",
            level: isPaid ? "info" : "warning",
            title: `Order #${row.number || id} → ${status}`,
            body: `Status changed from ${row.status} to ${status}.`,
            url: `/studio/commerce`,
            dedupeKey: `order:${id}:${status}`,
        })).catch(() => { });
        return (await getOrder(id));
    });
}
export async function addOrderNote(id: number, content: string, author: string, isCustomerNote: boolean) {
    if (!content.trim())
        throw new Error("Note content is required.");
    (await getDb().execute("INSERT INTO order_notes (order_id,author,content,is_customer_note,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id", id, author, content.trim(), isCustomerNote ? 1 : 0, now()));
    return (await getOrder(id));
}
export async function refundOrder(id: number, amount: number, reason: string) {
    return withTransaction(async () => {
        const db = getDb();
        const row = (await db.one("SELECT * FROM orders WHERE id=$1 FOR UPDATE", id));
        if (!row)
            throw new Error("Order not found.");
        const amt = round2(Number(amount));
        if (!(amt > 0))
            throw new Error("Refund amount must be greater than zero.");
        const already = Number(row.refunded_total);
        if (already + amt > Number(row.total) + 0.001)
            throw new Error("Refund exceeds order total.");
        (await db.execute("INSERT INTO order_refunds (order_id,amount,reason,created_at) VALUES ($1,$2,$3,$4) RETURNING id", id, amt, reason || "", now()));
        const newRefunded = round2(already + amt);
        const fully = newRefunded >= Number(row.total) - 0.001;
        (await db.execute("UPDATE orders SET refunded_total=$1, status=$2, updated_at=$3 WHERE id=$4", newRefunded, fully ? "refunded" : row.status, now(), id));
        (await db.execute("INSERT INTO order_notes (order_id,author,content,is_customer_note,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id", id, "admin", `Manual refund recorded: ${amt.toFixed(2)}${reason ? ` — ${reason}` : ""}. Transfer funds through your actual payment channel.`, 0, now()));
        return (await getOrder(id));
    });
}
export async function customerOrders(customerId: number) {
    return (await listOrders({ customer: customerId, perPage: 100 })).items;
}
export async function userOwnsProduct(userId: number, productId: number): Promise<boolean> {
    const row = (await getDb().one("SELECT o.id FROM orders o JOIN order_items i ON i.order_id=o.id\n     WHERE o.customer_id=$1 AND o.status IN ('processing','completed') AND (i.product_id=$2 OR i.variation_id=$3) LIMIT 1", userId, productId, productId));
    return !!row;
}
