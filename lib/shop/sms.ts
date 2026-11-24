import { getDb, withTransaction } from "../db";
import { getShopSettings, money } from "./core";
import { getProvince } from "./geo";

// Ported from the Persian Commerce SMS plugin. Order statuses gain virtual
// entries: `created` fires right after checkout, tracking-code is an event
// rather than a status, and `low`/`out` are stock pseudo-statuses used when
// messaging managers.
export const BASE_STATUSES: Record<string, string> = {
    pending: "Pending payment",
    processing: "Processing",
    "on-hold": "On hold",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
    failed: "Failed",
};

export const CREATED_STATUS = "created";
export const TRACKING_STATUS = "set-post-tracking-code";
export const LOW_STOCK_STATUS = "low";
export const OUT_OF_STOCK_STATUS = "out";

export function buyerStatusOptions(): { value: string; label: string }[] {
    return [
        { value: CREATED_STATUS, label: "Right after the order is placed" },
        ...Object.entries(BASE_STATUSES).map(([value, label]) => ({ value, label })),
        { value: TRACKING_STATUS, label: "When the post tracking code is saved" },
    ];
}

export function adminStatusOptions(): { value: string; label: string }[] {
    return [
        ...buyerStatusOptions(),
        { value: LOW_STOCK_STATUS, label: "Low stock" },
        { value: OUT_OF_STOCK_STATUS, label: "Out of stock" },
    ];
}

export function statusLabel(status: string): string {
    if (status === CREATED_STATUS)
        return "Right after the order is placed";
    if (status === TRACKING_STATUS)
        return "When the post tracking code is saved";
    if (status === LOW_STOCK_STATUS)
        return "Low stock";
    if (status === OUT_OF_STOCK_STATUS)
        return "Out of stock";
    return BASE_STATUSES[status] || status;
}

const CUSTOMER_BODY = "سلام {b_first_name} {b_last_name}\nسفارش {order_id} دریافت شد و هم اکنون در وضعیت {status} می‌باشد.\nآیتم های سفارش : {all_items}\nمبلغ سفارش : {price}\nشماره تراکنش : {transaction_id}";
const TRACKING_BODY = "{b_first_name} {b_last_name}\nسفارش {order_id} با کد رهگیری  {post_tracking_code} برای شما ارسال شد. پیگیری خرید {post_tracking_url}";
const SUPER_ADMIN_BODY = "سلام مدیر\nسفارش {order_id} ثبت شده است و هم اکنون در وضعیت {status} می‌باشد.\nآیتم های سفارش : {all_items}\nمبلغ سفارش : {price}";
const PRODUCT_ADMIN_BODY = "سلام\nسفارش {order_id} ثبت شده است و هم اکنون در وضعیت {status} می‌باشد.\nآیتم های سفارش متعلق به شما: {vendor_items}";

function perStatus(prefix: string, body: string, trackingBody?: string) {
    const out: Record<string, string> = {};
    for (const { value } of buyerStatusOptions()) {
        out[`${prefix}${value}`] = value === TRACKING_STATUS && trackingBody ? trackingBody : body;
    }
    return out;
}

export const SMS_DEFAULTS: Record<string, any> = {
    sms_gateway: "logger",
    sms_gateway_username: "",
    sms_gateway_password: "",
    sms_gateway_sender: "",
    sms_gateway_custom_url: "",
    sms_gateway_custom_method: "POST",
    sms_gateway_custom_headers: "",
    sms_gateway_custom_body: "",
    enable_admin_bar: 0,

    super_admin_phone: "",
    super_admin_bots: "",
    super_admin_order_status: [],

    enable_metabox: 1,
    buyer_checkbox_text: "میخواهم از وضعیت سفارش از طریق پیامک آگاه شوم.",
    order_status: [],

    product_admin_user_meta: "",
    product_admin_post_meta: "",
    product_admin_dokan_integration: 0,
    product_admin_meta_order_status: [],

    enable_notif_sms_main: 0,
    enable_notif_sms: "no",
    notif_title: "به من از طریق پیامک اطلاع بده",
    notif_only_loggedin: 0,
    notif_only_loggedin_text: "عضویت در خبرنامه محصول فقط برای اعضای سایت امکان پذیر خواهد بود.",
    notif_options: "1:زمانیکه محصول توقف فروش شد\n2:زمانیکه نسخه جدید محصول منتشر شد\n",

    enable_onsale: 0,
    notif_onsale_text: "زمانیکه محصول حراج شد",
    notif_onsale_sms: "سلام\nقیمت محصول {product_title} از {regular_price} به {onsale_price} کاهش یافت.",
    notif_onsale_remove_contacts: 1,
    enable_notif_no_stock: 0,
    notif_no_stock_text: "زمانیکه محصول موجود شد",
    notif_no_stock_sms: "سلام\nمحصول {product_title} هم اکنون موجود و قابل خرید می‌باشد.",
    notif_no_stock_remove_contacts: 1,
    enable_notif_low_stock: 0,
    notif_low_stock_text: "زمانیکه محصول رو به اتمام است",
    notif_low_stock_sms: "سلام\nموجودی محصول {product_title} کم می‌باشد. لطفا در صورت تمایل به خرید سریعتر اقدام نمایید.",
    notif_low_stock_remove_contacts: 1,

    admin_low_stock: "سلام\nموجودی انبار محصول {product_title} رو به اتمام است.",
    admin_out_stock: "سلام\nموجودی انبار محصول {product_title} به اتمام رسیده است.",
    stock_low_amount: 2,

    ...perStatus("sms_body_", CUSTOMER_BODY, TRACKING_BODY),
    ...perStatus("super_admin_sms_body_", SUPER_ADMIN_BODY),
    ...perStatus("product_admin_sms_body_", PRODUCT_ADMIN_BODY),
};

export const EVENT_TYPES: Record<number, string> = {
    1: "Bulk send",
    2: "Customer — automatic — order",
    3: "Customer — manual — order metabox",
    4: "Super admin — automatic — order",
    5: "Product manager — automatic — order",
    6: "Product manager — manual — product metabox",
    7: "Managers — automatic — out of stock",
    8: "Managers — automatic — low stock",
    9: "Newsletter — on sale — automatic",
    10: "Newsletter — on sale — manual",
    11: "Newsletter — in stock — automatic",
    12: "Newsletter — in stock — manual",
    13: "Newsletter — low stock — automatic",
    14: "Newsletter — low stock — manual",
    15: "Newsletter — custom option — manual",
    16: "Newsletter — delayed product SMS — automatic",
};

export async function getSmsSettings(): Promise<Record<string, any>> {
    const row = (await getDb().one("SELECT value FROM options WHERE name='sms_settings'"));
    let stored: Record<string, any> = {};
    try {
        stored = row ? JSON.parse(row.value) : {};
    }
    catch {
        stored = {};
    }
    return { ...SMS_DEFAULTS, ...stored };
}

export async function setSmsSettings(patch: Record<string, any>) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(7845233)");
        const next = { ...(await getSmsSettings()), ...patch };
        (await getDb().execute("INSERT INTO options (name,value) VALUES ('sms_settings',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value", JSON.stringify(next)));
        return next;
    });
}

/* ------------------------------- mobiles ------------------------------- */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toEnglishDigits(value: string): string {
    let out = String(value ?? "");
    FA_DIGITS.forEach((d, i) => { out = out.split(d).join(String(i)); });
    AR_DIGITS.forEach((d, i) => { out = out.split(d).join(String(i)); });
    return out;
}

// Mirrors modify_mobile(): ۰۹۱۲… → 0912…, 0098… → +98…, 912… → 0912…
export function modifyMobile(mobile: string): string {
    const raw = toEnglishDigits(String(mobile ?? "")).trim();
    if (!raw)
        return "";
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+"))
        return `+${digits}`;
    if (digits.startsWith("00"))
        return `+${digits.slice(2)}`;
    if (digits.startsWith("0"))
        return digits;
    return digits ? `0${digits}` : "";
}

export function validateMobile(mobile: string): boolean {
    const m = modifyMobile(mobile);
    if (!m)
        return false;
    if (/^09\d{9}$/.test(m))
        return true;
    if (/^\+989\d{9}$/.test(m))
        return true;
    return /^0\d{10}$/.test(m);
}

export function splitMobiles(input: string | string[]): string[] {
    const list = Array.isArray(input) ? input : String(input ?? "").split(",");
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
        const m = modifyMobile(item);
        if (!validateMobile(m) || seen.has(m))
            continue;
        seen.add(m);
        out.push(m);
    }
    return out;
}

/* -------------------------------- dates -------------------------------- */

// Jalali conversion identical to the plugin's jalali_date() helper.
export function jalaliDate(gy: number, gm: number, gd: number, sep = "/"): string {
    const d4 = gy % 4;
    const gA = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let doyG = gA[gm] + gd;
    if (d4 === 0 && gm > 2)
        doyG++;
    const d33 = Math.trunc(((gy - 16) % 132) * 0.0305);
    let a = (d33 === 3 || d33 < d4 - 1 || d4 === 0) ? 286 : 287;
    let b = ((d33 === 1 || d33 === 2) && (d33 === d4 || d4 === 1)) ? 78 : (d33 === 3 && d4 === 0 ? 80 : 79);
    if (Math.trunc((gy - 10) / 63) === 30) {
        a--;
        b++;
    }
    let jy: number;
    let doyJ: number;
    if (doyG > b) {
        jy = gy - 621;
        doyJ = doyG - b;
    }
    else {
        jy = gy - 622;
        doyJ = doyG + a;
    }
    let jm: number;
    let jd: number;
    if (doyJ < 187) {
        jm = Math.trunc((doyJ - 1) / 31);
        jd = doyJ - 31 * jm;
        jm++;
    }
    else {
        jm = Math.trunc((doyJ - 187) / 30);
        jd = doyJ - 186 - jm * 30;
        jm += 7;
    }
    const pad = (n: number) => (n > 9 ? String(n) : `0${n}`);
    return `${jy}${sep}${pad(jm)}${sep}${pad(jd)}`;
}

const TEHRAN_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false,
});

// maybe_jalali_date(): "YYYY/MM/DD - HH:mm", leaving non-ISO input untouched.
export function jalaliDateTime(iso: string | null | undefined): string {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return String(iso);
    const parts: Record<string, string> = {};
    for (const p of TEHRAN_PARTS.formatToParts(d))
        parts[p.type] = p.value;
    const hour = parts.hour === "24" ? "00" : parts.hour;
    const date = jalaliDate(Number(parts.year), Number(parts.month), Number(parts.day), "/");
    return `${date} - ${hour.padStart(2, "0")}:${parts.minute.padStart(2, "0")}`;
}

/* ------------------------------ shortcodes ------------------------------ */

// apply_tags(): plain, longest-key-first replacement so {b_first_name} never
// gets clobbered by a shorter {b_first}.
export function applyTags(content: string, tags: Record<string, string>): string {
    let out = String(content ?? "");
    const keys = Object.keys(tags).sort((a, b) => b.length - a.length);
    for (const key of keys)
        out = out.split(key).join(String(tags[key] ?? ""));
    return out;
}

export const SHORTCODE_GROUPS: Record<string, Record<string, string>> = {
    core: {
        "{mobile}": "Customer mobile",
        "{phone}": "Customer phone",
        "{email}": "Customer email",
        "{status}": "Order status",
        "{all_items}": "Order items",
        "{all_items_full}": "Order items with full variation name",
        "{all_items_qty}": "Order items with quantity",
        "{count_items}": "Number of order items",
        "{price}": "Order total",
        "{post_id}": "Order ID",
        "{order_id}": "Order number",
        "{transaction_id}": "Transaction ID",
        "{date}": "Order date",
        "{description}": "Customer note",
        "{payment_method}": "Payment method",
        "{shipping_method}": "Shipping method",
        "{payment_url}": "Payment link",
        "{b_first_name}": "Billing first name",
        "{b_last_name}": "Billing last name",
        "{b_company}": "Billing company",
        "{b_country}": "Billing country",
        "{b_state}": "Billing province/state",
        "{b_city}": "Billing city",
        "{b_address_1}": "Billing address 1",
        "{b_address_2}": "Billing address 2",
        "{b_postcode}": "Billing postcode",
        "{sh_first_name}": "Shipping first name",
        "{sh_last_name}": "Shipping last name",
        "{sh_company}": "Shipping company",
        "{sh_country}": "Shipping country",
        "{sh_state}": "Shipping province/state",
        "{sh_city}": "Shipping city",
        "{sh_address_1}": "Shipping address 1",
        "{sh_address_2}": "Shipping address 2",
        "{sh_postcode}": "Shipping postcode",
    },
    vendor: {
        "{vendor_name}": "Vendor name",
        "{vendor_items}": "Order items belonging to this vendor",
        "{vendor_items_qty}": "Vendor items with quantity",
        "{count_vendor_items}": "Number of vendor items",
        "{vendor_price}": "Vendor items total",
    },
    notification: {
        "{product_id}": "Product ID",
        "{product_url}": "Product link",
        "{sku}": "Product SKU",
        "{product_title}": "Product title",
        "{product_title_full}": "Product title with variation",
        "{regular_price}": "Regular price",
        "{onsale_price}": "Sale price",
        "{onsale_from}": "Sale starts",
        "{onsale_to}": "Sale ends",
        "{stock}": "Stock quantity",
    },
    post_tracking: {
        "{post_tracking_code}": "Post tracking code",
        "{post_tracking_url}": "Post tracking URL",
    },
};

/* --------------------------- product meta --------------------------- */

export async function getProductSmsMeta(productId: number, key: string): Promise<string> {
    const row = (await getDb().one("SELECT value FROM sms_product_meta WHERE product_id=$1 AND key=$2", productId, key));
    return row ? String(row.value ?? "") : "";
}

export async function getProductSmsMetaMap(productId: number): Promise<Record<string, string>> {
    const rows = (await getDb().many("SELECT key, value FROM sms_product_meta WHERE product_id=$1", productId));
    const out: Record<string, string> = {};
    for (const r of rows)
        out[r.key] = String(r.value ?? "");
    return out;
}

export async function setProductSmsMeta(productId: number, key: string, value: string) {
    if (value === "") {
        await getDb().execute("DELETE FROM sms_product_meta WHERE product_id=$1 AND key=$2", productId, key);
        return;
    }
    await getDb().execute("INSERT INTO sms_product_meta (product_id,key,value) VALUES ($1,$2,$3) ON CONFLICT (product_id,key) DO UPDATE SET value=EXCLUDED.value", productId, key, value);
}

export async function saveProductSmsMeta(productId: number, patch: Record<string, string>) {
    return withTransaction(async () => {
        for (const [key, value] of Object.entries(patch))
            await setProductSmsMeta(productId, key, String(value ?? ""));
    });
}

// get_sms_setting(): the product override wins, otherwise the global option.
export async function productSmsSetting(settings: Record<string, any>, key: string, productId: number): Promise<string> {
    const own = await getProductSmsMeta(productId, key);
    if (own !== "")
        return own;
    return String(settings[key] ?? "");
}

export function maybeBool(value: any): boolean {
    if (value === true || value === 1 || value === "1")
        return true;
    for (const token of ["yes", "on", "true"]) {
        if (String(value ?? "").toLowerCase() === token)
            return true;
    }
    return false;
}

export async function hasNotifCondition(settings: Record<string, any>, key: string, productId: number): Promise<boolean> {
    if (!maybeBool(settings.enable_notif_sms_main))
        return false;
    return maybeBool(await productSmsSetting(settings, key, productId));
}

// notif_options is "1:label\n2:label"; the plugin keys groups by numeric code.
export function parseCustomGroups(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    const re = /(\d+)\s*:\s*([^\n\r]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(raw ?? "")))) {
        const label = m[2].trim();
        if (label)
            out[m[1]] = label;
    }
    return out;
}
