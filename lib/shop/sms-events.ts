import { getDb } from "../db";
import { sendSms } from "./sms-gateways-registry";
import { getSmsSettings, maybeBool, modifyMobile, splitMobiles, validateMobile } from "./sms";
import { buildTags, replaceOrderShortCodes, replaceProductTags } from "./sms-tags";
import { getOrder, hydrateOrder } from "./orders";
import { getProduct } from "./products";

// Event codes mirror the plugin's EventsEnum.
export const SM_EVENTS = {
    BULK_SEND: 1,
    CUSTOMER_ORDER: 2,
    CUSTOMER_ORDER_MANUAL: 3,
    SUPER_ADMIN_ORDER: 4,
    PRODUCT_ADMIN_ORDER: 5,
    PRODUCT_ADMIN_MANUAL: 6,
    MANAGERS_OUT_OF_STOCK: 7,
    MANAGERS_LOW_STOCK: 8,
    NEWS_ONSALE: 9,
    NEWS_ONSALE_MANUAL: 10,
    NEWS_IN_STOCK: 11,
    NEWS_IN_STOCK_MANUAL: 12,
    NEWS_LOW_STOCK: 13,
    NEWS_LOW_STOCK_MANUAL: 14,
    NEWS_CUSTOM: 15,
    NEWS_DELAYED: 16,
} as const;

/* ------------------------------- helpers ------------------------------- */

export function buyerMobile(order: { billing?: Record<string, any> } | null | undefined): string {
    const phone = String(order?.billing?.phone || "").trim();
    return phone ? modifyMobile(phone) : "";
}

// order_status is stored as a multicheck: object whose keys are enabled statuses.
export function allowedStatuses(settings: Record<string, any>): string[] {
    const raw = settings.order_status;
    if (Array.isArray(raw))
        return raw.map(String);
    if (raw && typeof raw === "object")
        return Object.keys(raw);
    if (typeof raw === "string" && raw)
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
}

export function adminAllowedStatuses(settings: Record<string, any>): string[] {
    const raw = settings.super_admin_order_status;
    if (Array.isArray(raw))
        return raw.map(String);
    if (raw && typeof raw === "object")
        return Object.keys(raw);
    if (typeof raw === "string" && raw)
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
}

export function productAdminAllowedStatuses(settings: Record<string, any>): string[] {
    const raw = settings.product_admin_meta_order_status;
    if (Array.isArray(raw))
        return raw.map(String);
    if (raw && typeof raw === "object")
        return Object.keys(raw);
    if (typeof raw === "string" && raw)
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
}

export function botRecipients(settings: Record<string, any>): string[] {
    const raw = String(settings.super_admin_bots || "");
    if (!raw.trim())
        return [];
    return raw.split(/[\n\r,;|]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
}

// Bot::send() — posts the message to bot.woocommerce.ir with an order button.
export async function sendBotMessage(settings: Record<string, any>, data: {
    message: string;
    post_id?: number;
    origin?: string;
}): Promise<boolean> {
    const recipients = botRecipients(settings);
    if (!recipients.length || !String(data.message || "").trim())
        return false;
    const payload: Record<string, any> = { text: data.message, recipients };
    if (data.post_id) {
        const origin = String(data.origin || "").replace(/\/+$/, "");
        payload.buttons = [[{ text: `🔍 مشاهده سفارش ${data.post_id}`, url: `${origin}/studio/commerce/orders/${data.post_id}` }]];
    }
    try {
        const res = await fetch("https://bot.woocommerce.ir/api/v1/sendMessage", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return res.status === 200;
    }
    catch {
        return false;
    }
}

// Bot messages are fire-and-forget; a failed call must never block SMS.
export function sendBotAsync(settings: Record<string, any>, data: { message: string; post_id?: number; origin?: string }) {
    void sendBotMessage(settings, data).catch(() => false);
}

/* ---------------------------- order dispatch ---------------------------- */

export interface OrderDispatchResult {
    customer?: { sent: boolean; result: true | string; mobile: string; message: string };
    super_admin?: { sent: boolean; result: true | string; mobile: string };
    product_admins: { mobile: string; sent: boolean; result: true | string }[];
}

// send_order_sms(): fan out one order event to customer, super admin and the
// product's managers. `trigger` mirrors the Rayomand Core hook that fired:
//   "created" — checkout just finished
//   "status"  — status changed (oldStatus -> newStatus)
//   "manual"  — admin pressed the send button in the order screen
export async function dispatchOrderSms(input: {
    orderId: number;
    trigger: "created" | "status" | "manual";
    oldStatus?: string;
    newStatus?: string;
    manualMessage?: string;
    manualToCustomer?: boolean;
    origin?: string;
}): Promise<OrderDispatchResult | null> {
    const order = await getOrder(input.orderId);
    if (!order)
        return null;

    const settings = await getSmsSettings();
    if (String(settings.sms_gateway || "logger") === "none")
        return null;

    const isCreated = input.trigger === "created";
    const isManual = input.trigger === "manual";
    const newStatus = input.newStatus || (isCreated ? "created" : order.status);
    const oldStatus = input.oldStatus || "";
    if (!isCreated && !isManual && oldStatus && oldStatus === newStatus)
        return null;

    const origin = String(input.origin || "").replace(/\/+$/, "");
    const out: OrderDispatchResult = { product_admins: [] };
    const mobile = buyerMobile(order);

    // Customer — only when they opted in and the status is enabled.
    const optIn = Number((order as any).sms_opt_in ?? 1) !== 0;
    const customerEnabled = isManual ? !!input.manualToCustomer : optIn && allowedStatuses(settings).includes(newStatus);
    if (customerEnabled) {
        const message = input.manualMessage
            ? input.manualMessage
            : String(settings[`sms_body_${newStatus}`] ?? "");
        const body = await replaceOrderShortCodes(message, newStatus, order, origin);
        const result = await sendSms({
            mobile, message: body, type: SM_EVENTS.CUSTOMER_ORDER, post_id: order.id, post_type: "order", settings,
        });
        const sent = result === true;
        out.customer = { sent, result, mobile, message: body };
        await addNote(order.id, sent
            ? `SMS delivered to the customer at ${mobile}.`
            : `SMS to the customer at ${mobile} failed. Gateway response: ${result}`);
    }

    // Super admin — direct SMS plus the bot relay.
    if (!isManual && adminAllowedStatuses(settings).includes(newStatus)) {
        const adminMobiles = splitMobiles(String(settings.super_admin_phone || ""));
        if (adminMobiles.length) {
            const message = await replaceOrderShortCodes(String(settings[`super_admin_sms_body_${newStatus}`] ?? ""), newStatus, order, origin);
            const result = await sendSms({
                mobile: adminMobiles, message, type: SM_EVENTS.SUPER_ADMIN_ORDER, post_id: order.id, post_type: "order", settings,
            });
            const sent = result === true;
            out.super_admin = { sent, result, mobile: adminMobiles.join(",") };
            await addNote(order.id, sent
                ? `SMS delivered to the super admin at ${adminMobiles.join(", ")}.`
                : `SMS to the super admin failed. Gateway response: ${result}`);
        }
        if (botRecipients(settings).length) {
            const botBody = await replaceOrderShortCodes(String(settings[`super_admin_sms_body_${newStatus}`] ?? ""), newStatus, order, origin);
            sendBotAsync(settings, { message: botBody, post_id: order.id, origin });
        }
    }

    // Product managers / vendors — one message per manager, only for an order
    // that is not a Dokan parent (sub-orders notify their own vendor).
    if (!isManual && productAdminAllowedStatuses(settings).includes(newStatus)) {
        const managers = await productAdminMobiles(order.items.map((i: any) => i.product_id), newStatus, settings);
        for (const manager of managers) {
            const vendor = await vendorItems(order, manager.products);
            const message = await replaceOrderShortCodes(
                String(settings[`product_admin_sms_body_${newStatus}`] ?? ""), newStatus, order, origin,
                { vendor_name: manager.vendor_name, items: vendor.items, items_qty: vendor.items_qty, prices: vendor.prices },
            );
            const result = await sendSms({
                mobile: manager.mobile, message, type: SM_EVENTS.PRODUCT_ADMIN_ORDER, post_id: order.id, post_type: "order", settings,
            });
            const sent = result === true;
            out.product_admins.push({ mobile: manager.mobile, sent, result });
            await addNote(order.id, sent
                ? `SMS delivered to the product manager at ${manager.mobile}.`
                : `SMS to the product manager at ${manager.mobile} failed. Gateway response: ${result}`);
        }
    }

    return out;
}

async function addNote(orderId: number, content: string) {
    await getDb().execute(
        "INSERT INTO order_notes (order_id,author,content,is_customer_note,created_at) VALUES ($1,$2,$3,$4,$5)",
        orderId, "system", content, 0, new Date().toISOString(),
    );
}

/* ------------------------ product manager mobiles ------------------------ */

export interface ProductManager {
    mobile: string;
    products: number[];
    vendor_name: string;
}

// product_admin_mobiles(): managers come from the per-product SMS tab, which
// stores the same `[{mobile, statuses}]` list the plugin keeps in
// `_pwoosms_product_admin_data`. An entry without statuses inherits every
// status configured globally, matching prepare_admin_product_status().
export async function productAdminMobiles(productIds: number[], status: string, settings: Record<string, any>): Promise<ProductManager[]> {
    const db = getDb();
    const seen = new Map<string, ProductManager>();
    const fallbackStatuses = productAdminAllowedStatuses(settings);

    for (const productId of Array.from(new Set(productIds.filter(Boolean)))) {
        const rows = await db.many("SELECT value FROM sms_product_meta WHERE product_id=$1 AND key='product_admin_data'", productId);
        const raw = rows[0]?.value ? safeParse(rows[0].value) : null;

        for (const item of Array.isArray(raw) ? raw : []) {
            if (!item?.mobile)
                continue;
            const statuses = Array.isArray(item.statuses)
                ? item.statuses.map(String)
                : String(item.statuses || "").split(",").map((s: string) => s.trim()).filter(Boolean);
            const allowed = statuses.length ? statuses : fallbackStatuses;
            if (status && !allowed.includes(status))
                continue;

            for (const one of splitMobiles(String(item.mobile))) {
                const entry = seen.get(one) || { mobile: one, products: [], vendor_name: "" };
                if (!entry.products.includes(productId))
                    entry.products.push(productId);
                if (item.vendor_name)
                    entry.vendor_name = String(item.vendor_name);
                seen.set(one, entry);
            }
        }
    }

    return Array.from(seen.values());
}

function safeParse(value: string): any {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}

// get_product_lists(): items belonging to a vendor, with quantity and prices.
export async function vendorItems(order: any, productIds: number[]) {
    const items: string[] = [];
    const itemsQty: string[] = [];
    const prices: number[] = [];
    for (const item of order.items || []) {
        if (!productIds.includes(Number(item.product_id)))
            continue;
        items.push(String(item.name));
        itemsQty.push(`${item.name} (${item.quantity})`);
        prices.push(Number(item.total || 0));
    }
    return { items, items_qty: itemsQty, prices };
}

/* --------------------------- stock / newsletter --------------------------- */

function lowStockLimit(product: any, settings: Record<string, any>): number {
    const own = Number((product as any).low_stock_amount);
    if (own > 0)
        return own;
    const configured = Number(settings.stock_low_amount);
    return configured > 0 ? configured : 2;
}

function stockManaged(product: any): boolean {
    return !!product.manage_stock && product.stock_quantity != null;
}

// Managers' out-of-stock / low-stock notifications (AdminEvents::low_stock and
// out_of_stock). Returns true when nothing needed sending (i.e. the caller
// should not treat it as a failure), false only on a genuine send problem.
export async function dispatchStockManagerEvent(productId: number, kind: "low" | "out"): Promise<boolean> {
    const product = await getProduct(productId);
    if (!product || product.status !== "publish" || product.type === "variable")
        return false;
    if (kind === "low") {
        if (product.stock_status !== "instock")
            return false;
        if (!stockManaged(product))
            return false;
    }

    const settings = await getSmsSettings();
    const parentId = product.parent_id || product.id;
    const parent = parentId === product.id ? product : await getProduct(parentId);
    if (!parent)
        return false;

    const metaKey = kind === "low" ? "admin_low_stock_send" : "admin_out_stock_send";
    const history = safeParse((await productMeta(parentId, metaKey)) || "{}") || {};
    const limit = lowStockLimit(product, settings);

    // Stock recovered above the threshold: clear the sent flag and stop.
    if (kind === "low" && Number(product.stock_quantity ?? 0) > limit) {
        if (history[productId] !== undefined) {
            delete history[productId];
            await setProductMeta(parentId, metaKey, Object.keys(history).length ? JSON.stringify(history) : "");
        }
        return true;
    }
    if (kind === "out" && product.stock_status === "instock") {
        if (history[productId] !== undefined) {
            delete history[productId];
            await setProductMeta(parentId, metaKey, Object.keys(history).length ? JSON.stringify(history) : "");
        }
        return true;
    }

    if (history[productId] === "yes")
        return false;

    const receivers = await managerMobiles(parentId, settings, kind);
    if (!receivers.length)
        return false;

    const messageText = String(settings[kind === "low" ? "admin_low_stock" : "admin_out_stock"] || "");
    const message = await replaceProductTags(messageText, product, parent, "");
    const result = await sendSms({
        mobile: receivers, message,
        type: kind === "low" ? SM_EVENTS.MANAGERS_LOW_STOCK : SM_EVENTS.MANAGERS_OUT_OF_STOCK,
        post_id: productId, post_type: "product", settings,
    });
    sendBotAsync(settings, { message });

    if (result === true) {
        history[productId] = "yes";
        await setProductMeta(parentId, metaKey, JSON.stringify(history));
        return true;
    }
    return false;
}

// Super-admin phone (only when `low`/`out` is enabled in their multicheck) plus
// the product's own managers, deduplicated.
async function managerMobiles(parentId: number, settings: Record<string, any>, status: "low" | "out"): Promise<string[]> {
    const receivers = new Set<string>();
    if (adminAllowedStatuses(settings).includes(status)) {
        for (const m of splitMobiles(String(settings.super_admin_phone || "")))
            receivers.add(m);
    }
    for (const manager of await productAdminMobiles([parentId], status, settings))
        receivers.add(manager.mobile);
    return Array.from(receivers);
}

async function productMeta(productId: number, key: string): Promise<string> {
    const row = await getDb().one("SELECT value FROM sms_product_meta WHERE product_id=$1 AND key=$2", productId, key);
    return row ? String(row.value ?? "") : "";
}

async function setProductMeta(productId: number, key: string, value: string) {
    if (value === "") {
        await getDb().execute("DELETE FROM sms_product_meta WHERE product_id=$1 AND key=$2", productId, key);
        return;
    }
    await getDb().execute(
        "INSERT INTO sms_product_meta (product_id,key,value) VALUES ($1,$2,$3) ON CONFLICT (product_id,key) DO UPDATE SET value=EXCLUDED.value",
        productId, key, value,
    );
}

/* ----------------------------- newsletter ----------------------------- */

// The three automatic newsletter events (CustomerEvents).
export async function dispatchNewsletterEvent(productId: number, group: "_onsale" | "_in" | "_low"): Promise<boolean> {
    const product = await getProduct(productId);
    if (!product || product.type === "variable")
        return false;
    const parentId = product.parent_id || product.id;
    const parent = parentId === product.id ? product : await getProduct(parentId);
    if (!parent)
        return false;

    const settings = await getSmsSettings();
    if (!maybeBool(settings.enable_notif_sms_main))
        return false;

    const metaKey = { _onsale: "onsale_send", _in: "in_stock_send", _low: "low_stock_send" }[group];
    const eventType = { _onsale: SM_EVENTS.NEWS_ONSALE, _in: SM_EVENTS.NEWS_IN_STOCK, _low: SM_EVENTS.NEWS_LOW_STOCK }[group];
    const enabledKey = { _onsale: "enable_onsale", _in: "enable_notif_no_stock", _low: "enable_notif_low_stock" }[group];
    const messageKey = { _onsale: "notif_onsale_sms", _in: "notif_no_stock_sms", _low: "notif_low_stock_sms" }[group];

    if (!maybeBool(await productSetting(settings, enabledKey, parentId)))
        return false;

    const history = safeParse((await productMeta(parentId, metaKey)) || "{}") || {};

    if (group === "_onsale") {
        if (!product.on_sale) {
            if (history[productId] !== undefined) {
                delete history[productId];
                await setProductMeta(parentId, metaKey, Object.keys(history).length ? JSON.stringify(history) : "");
            }
            return false;
        }
        if (history[productId] === String(product.sale_price))
            return false;
    }
    else if (group === "_in") {
        if (product.stock_status !== "instock") {
            if (history[productId] !== undefined) {
                delete history[productId];
                await setProductMeta(parentId, metaKey, Object.keys(history).length ? JSON.stringify(history) : "");
            }
            return false;
        }
        if (history[productId] === "yes")
            return false;
    }
    else {
        if (!stockManaged(product))
            return false;
        const qty = Number(product.stock_quantity ?? 0);
        if (qty > lowStockLimit(product, settings)) {
            if (history[productId] !== undefined) {
                delete history[productId];
                await setProductMeta(parentId, metaKey, Object.keys(history).length ? JSON.stringify(history) : "");
            }
            return false;
        }
        if (history[productId] === "yes")
            return false;
    }

    let receivers = await contactsFor(parentId, group);
    receivers = Array.from(new Set([...receivers, ...(await contactsFor(productId, group))]));
    receivers = await removeSent(receivers, eventType, productId);
    if (!receivers.length)
        return false;

    const message = await replaceProductTags(String(settings[messageKey] || ""), product, parent, "");
    const result = await sendSms({ mobile: receivers, message, type: eventType, post_id: productId, post_type: "product", settings });
    sendBotAsync(settings, { message });

    if (result !== true)
        return false;

    history[productId] = group === "_onsale" ? String(product.sale_price) : "yes";
    await setProductMeta(parentId, metaKey, JSON.stringify(history));

    if (maybeBool(settings[{ _onsale: "notif_onsale_remove_contacts", _in: "notif_no_stock_remove_contacts", _low: "notif_low_stock_remove_contacts" }[group]])) {
        await removeContactsGroup(receivers, group, productId);
        if (product.parent_id)
            await removeContactsGroup(receivers, group, product.parent_id);
    }
    return true;
}

async function productSetting(settings: Record<string, any>, key: string, productId: number): Promise<string> {
    const own = await productMeta(productId, key);
    return own !== "" ? own : String(settings[key] ?? "");
}

async function contactsFor(productId: number, group: string): Promise<string[]> {
    const rows = await getDb().many(
        "SELECT mobile FROM sms_contacts WHERE product_id=$1 AND groups LIKE $2",
        productId, `%${group}%`,
    );
    return Array.from(new Set(rows.map((r: any) => String(r.mobile)).filter(Boolean)));
}

async function removeSent(mobiles: string[], type: number, postId: number): Promise<string[]> {
    if (!mobiles.length)
        return [];
    const since = new Date(Date.now() - 86400000).toISOString();
    const rows = await getDb().many(
        "SELECT reciever FROM sms_archive WHERE type=$1 AND post_id=$2 AND post_type='product' AND created_at >= $3",
        type, postId, since,
    );
    const sent = new Set<string>();
    for (const r of rows)
        for (const m of String(r.reciever || "").split(","))
            sent.add(m.trim());
    return mobiles.filter((m) => !sent.has(m));
}

async function removeContactsGroup(mobiles: string[], group: string, productId: number) {
    const db = getDb();
    for (const mobile of mobiles) {
        const row = await db.one("SELECT id, groups FROM sms_contacts WHERE product_id=$1 AND mobile=$2", productId, mobile);
        if (!row)
            continue;
        const groups = String(row.groups || "").split(",").map((g: string) => g.trim()).filter((g: string) => g && g !== group);
        if (groups.length)
            await db.execute("UPDATE sms_contacts SET groups=$1 WHERE id=$2", groups.join(","), row.id);
        else
            await db.execute("DELETE FROM sms_contacts WHERE id=$1", row.id);
    }
}

/* ------------------------------ archive ------------------------------ */

// Product saves fan out to three Rayomand Core hooks in the plugin: onsale on any
// product meta save, in_stock on a stock-status transition, and low_stock on
// the quantity hook. Compare the saved row with the previous one and fire the
// matching events so a single PATCH behaves like the original.
export async function dispatchProductSaveSms(previous: any | null, saved: any): Promise<void> {
    if (!saved || saved.type === "variable")
        return;
    const beforeOnSale = previous ? !!previous.on_sale : false;
    const beforeStock = previous ? String(previous.stock_status) : "";
    const beforeQty = previous ? Number(previous.stock_quantity ?? 0) : 0;

    if (saved.on_sale && (!beforeOnSale || (previous && previous.sale_price !== saved.sale_price)))
        await dispatchNewsletterEvent(saved.id, "_onsale");

    const nowOut = saved.stock_status !== "instock";
    const wasOut = beforeStock !== "instock";
    if (nowOut !== wasOut) {
        if (nowOut) {
            await dispatchStockManagerEvent(saved.id, "out");
        }
        else {
            await dispatchNewsletterEvent(saved.id, "_in");
            await dispatchStockManagerEvent(saved.id, "out");
        }
    }

    if (stockManaged(saved)) {
        const qty = Number(saved.stock_quantity ?? 0);
        const settings = await getSmsSettings();
        if (qty <= lowStockLimit(saved, settings) && qty > 0 && beforeQty > lowStockLimit(saved, settings)) {
            await dispatchNewsletterEvent(saved.id, "_low");
            await dispatchStockManagerEvent(saved.id, "low");
        }
        else if (qty > lowStockLimit(saved, settings)) {
            await dispatchStockManagerEvent(saved.id, "low");
        }
    }
}

export { hydrateOrder, validateMobile, buildTags };
