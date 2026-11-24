import { getDb, withTransaction } from "../db";
import { getSmsSettings, maybeBool, modifyMobile, parseCustomGroups, productSmsSetting, validateMobile } from "./sms";
import { getProductSmsMeta, getProductSmsMetaMap, saveProductSmsMeta } from "./sms";

// Contacts::get_groups(): the automatic groups plus the per-product custom ones.
// `check` skips groups the product's current state makes irrelevant (on sale /
// in stock / low stock), `cond` only includes globally enabled notifications.
export async function smsGroups(productId: number, check = true, cond = true): Promise<Record<string, string>> {
    const settings = await getSmsSettings();
    const product = await getDb().one("SELECT id, type, stock_status, stock_quantity, manage_stock, regular_price, sale_price FROM products WHERE id=$1", productId);
    const groups: Record<string, string> = {};

    const onSale = !!product && product.sale_price != null && product.regular_price != null && Number(product.sale_price) < Number(product.regular_price);
    const inStock = !product || product.stock_status === "instock";
    const lowLimit = Number(settings.stock_low_amount) > 0 ? Number(settings.stock_low_amount) : 2;
    const isLow = !!product && product.manage_stock && product.stock_quantity != null
        && Number(product.stock_quantity) <= lowLimit && Number(product.stock_quantity) > 0;

    if (!check || !onSale) {
        if (!cond || maybeBool(await productSmsSetting(settings, "enable_onsale", productId)))
            groups._onsale = await productSmsSetting(settings, "notif_onsale_text", productId);
    }
    if (!check || !inStock) {
        if (!cond || maybeBool(await productSmsSetting(settings, "enable_notif_no_stock", productId)))
            groups._in = await productSmsSetting(settings, "notif_no_stock_text", productId);
    }
    if (!check || !isLow) {
        if (!cond || maybeBool(await productSmsSetting(settings, "enable_notif_low_stock", productId)))
            groups._low = await productSmsSetting(settings, "notif_low_stock_text", productId);
    }

    const custom = parseCustomGroups(await productSmsSetting(settings, "notif_options", productId));
    Object.assign(groups, custom);

    const out: Record<string, string> = {};
    for (const [key, label] of Object.entries(groups)) {
        if (String(label || "").trim())
            out[key] = String(label);
    }
    return out;
}

export function normalizeGroups(groups: unknown): string[] {
    const list = Array.isArray(groups) ? groups : String(groups ?? "").split(",");
    return Array.from(new Set(list.map((g) => String(g).trim()).filter(Boolean)));
}

function joinGroups(groups: string[]): string {
    return normalizeGroups(groups).join(",");
}

export async function contactFor(productId: number, mobile: string) {
    const m = modifyMobile(mobile);
    return getDb().one("SELECT * FROM sms_contacts WHERE product_id=$1 AND mobile=$2", productId, m);
}

// Contacts::get_contacts_mobile(): LIKE matching keeps the plugin's behaviour
// where a stored mobile may carry a prefix.
export async function contactsMobile(productId: number, group: string): Promise<string[]> {
    const rows = await getDb().many("SELECT mobile FROM sms_contacts WHERE product_id=$1 AND groups LIKE $2", productId, `%${group}%`);
    return Array.from(new Set(rows.map((r: any) => String(r.mobile)).filter(Boolean)));
}

export async function insertContact(input: { product_id: number; mobile: string; groups: unknown }) {
    const mobile = modifyMobile(input.mobile);
    const groups = joinGroups(normalizeGroups(input.groups));
    if (!input.product_id || !mobile || !groups)
        return false;
    const existing = await contactFor(input.product_id, mobile);
    if (existing) {
        const merged = joinGroups([...String(existing.groups || "").split(","), ...groups.split(",")]);
        return updateContact({ id: existing.id, mobile, groups: merged });
    }
    await getDb().execute(
        "INSERT INTO sms_contacts (product_id,mobile,groups,created_at) VALUES ($1,$2,$3,$4)",
        input.product_id, mobile, groups, new Date().toISOString(),
    );
    return true;
}

export async function updateContact(input: { id: number; mobile?: string; groups?: unknown }) {
    const mobile = input.mobile ? modifyMobile(input.mobile) : null;
    const groups = input.groups !== undefined ? joinGroups(normalizeGroups(input.groups)) : null;
    if (!input.id || (mobile !== null && !mobile) || (groups !== null && !groups))
        return false;
    await getDb().execute(
        "UPDATE sms_contacts SET mobile=COALESCE($1,mobile), groups=COALESCE($2,groups) WHERE id=$3",
        mobile, groups, input.id,
    );
    return true;
}

export async function deleteContacts(ids: number[]) {
    if (!ids.length)
        return 0;
    const r = await getDb().execute("DELETE FROM sms_contacts WHERE id = ANY($1::int[])", ids);
    return r.changes;
}

export async function listContacts(q: { productId?: number; search?: string; page?: number; perPage?: number } = {}) {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.productId)
        where.push(`product_id=$${params.push(q.productId)}`);
    if (q.search) {
        where.push(`(mobile LIKE $${params.push(`%${q.search}%`)} OR CAST(product_id AS TEXT) LIKE $${params.push(`%${q.search}%`)})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number((await db.one(`SELECT COUNT(*) c FROM sms_contacts ${whereSql}`, ...params)).c);
    const perPage = Math.min(Number(q.perPage) || 20, 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const items = await db.many(
        `SELECT c.*, p.name AS product_name FROM sms_contacts c LEFT JOIN products p ON p.id=c.product_id ${whereSql} ORDER BY c.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params, perPage, (page - 1) * perPage,
    );
    return { items, total, pages: Math.max(1, Math.ceil(total / perPage)) };
}

// SubscriptionAPI::subscribe() — the storefront newsletter form.
export async function subscribeNewsletter(input: { productId: number; mobile: string; groups: unknown; loggedIn: boolean }) {
    const settings = await getSmsSettings();
    const productId = Number(input.productId);
    if (!productId)
        return { ok: false, status: 400, message: "شناسه محصول یافت نشد." };

    const loggedInOnly = maybeBool(await productSmsSetting(settings, "notif_only_loggedin", productId));
    if (loggedInOnly && !input.loggedIn)
        return { ok: false, status: 403, message: await productSmsSetting(settings, "notif_only_loggedin_text", productId) };

    const mobile = modifyMobile(String(input.mobile ?? ""));
    if (!mobile)
        return { ok: false, status: 200, message: "شماره موبایل را وارد نمایید." };
    if (!validateMobile(mobile))
        return { ok: false, status: 200, message: "شماره موبایل معتبر نیست." };

    const groups = normalizeGroups(input.groups);
    if (!groups.length)
        return { ok: false, status: 200, message: "انتخاب یکی از گزینه ها الزامیست." };

    const existing = await contactFor(productId, mobile);
    if (existing) {
        const merged = joinGroups([...String(existing.groups || "").split(","), ...groups]);
        const saved = await updateContact({ id: existing.id, mobile, groups: merged });
        return saved
            ? { ok: true, status: 200, message: "اطلاعات شما با موفقیت بروز شد." }
            : { ok: false, status: 500, message: "خطایی رخ داده است. مجددا تلاش کنید." };
    }
    const saved = await insertContact({ product_id: productId, mobile, groups });
    return saved
        ? { ok: true, status: 200, message: "اطلاعات شما با موفقیت ثبت شد." }
        : { ok: false, status: 500, message: "خطایی رخ داده است. مجددا تلاش کنید." };
}

/* -------------------- per-product SMS tab settings -------------------- */

export const PRODUCT_SMS_KEYS = [
    "enable_notif_sms", "notif_title", "notif_only_loggedin", "notif_only_loggedin_text",
    "enable_onsale", "notif_onsale_text", "notif_onsale_sms",
    "enable_notif_no_stock", "notif_no_stock_text", "notif_no_stock_sms",
    "enable_notif_low_stock", "notif_low_stock_text", "notif_low_stock_sms",
    "notif_options",
] as const;

export async function getProductSmsTab(productId: number) {
    const settings = await getSmsSettings();
    const stored = await getProductSmsMetaMap(productId);
    const values: Record<string, string> = {};
    for (const key of PRODUCT_SMS_KEYS)
        values[key] = stored[key] !== undefined ? stored[key] : String(settings[key] ?? "");
    let admins: { mobile: string; statuses: string[] }[] = [];
    try {
        const parsed = JSON.parse(stored.product_admin_data || "[]");
        if (Array.isArray(parsed))
            admins = parsed;
    }
    catch { /* ignore */ }
    return {
        enabled: maybeBool(settings.enable_notif_sms_main),
        values,
        overrides: Object.fromEntries(Object.keys(stored).filter((k) => (PRODUCT_SMS_KEYS as readonly string[]).includes(k)).map((k) => [k, stored[k]])),
        admins,
    };
}

export async function saveProductSmsTab(productId: number, input: Record<string, any>) {
    return withTransaction(async () => {
        const settings = await getSmsSettings();
        const patch: Record<string, string> = {};
        for (const key of PRODUCT_SMS_KEYS) {
            if (input[key] === undefined)
                continue;
            const value = String(input[key] ?? "");
            patch[key] = value === String(settings[key] ?? "") ? "" : value;
        }
        if (Array.isArray(input.admins)) {
            const admins = input.admins
                .map((a: any) => ({ mobile: modifyMobile(String(a?.mobile || "")), statuses: normalizeGroups(a?.statuses) }))
                .filter((a: any) => validateMobile(a.mobile));
            patch.product_admin_data = admins.length ? JSON.stringify(admins) : "";
        }
        await saveProductSmsMeta(productId, patch);
        return getProductSmsTab(productId);
    });
}

export { getProductSmsMeta };
