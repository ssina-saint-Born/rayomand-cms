import { getDb } from "../db";
import { getShopSettings, money } from "./core";
import { getProvince } from "./geo";
import { applyTags, getProductSmsMeta, jalaliDateTime, modifyMobile, statusLabel } from "./sms";

const COUNTRIES: Record<string, string> = { IR: "Iran", US: "United States", GB: "United Kingdom", DE: "Germany", AE: "United Arab Emirates" };

function countryName(code: string): string {
    const key = String(code || "").toUpperCase();
    return COUNTRIES[key] || String(code || "");
}

function stateName(country: string, state: string): string {
    if (String(country || "").toUpperCase() !== "IR" || !state)
        return String(state || "");
    return getProvince(state)?.name || state;
}

export interface OrderItemLike {
    name: string;
    quantity: number;
    total: number;
    subtotal?: number;
    product_id: number;
    variation_id?: number;
}

export interface OrderLike {
    id: number;
    number?: string | null;
    status: string;
    billing: Record<string, any>;
    shipping: Record<string, any>;
    items: OrderItemLike[];
    total: number;
    transaction_id?: string;
    payment_method_title?: string;
    payment_method?: string;
    shipping_method?: string;
    shipping_method_title?: string;
    customer_note?: string;
    created_at: string;
    paid_at?: string | null;
    access_token?: string;
}

export interface VendorItems {
    vendor_name?: string;
    product_ids?: number[];
    items?: string[];
    items_qty?: string[];
    prices?: number[];
    post_tracking_code?: string;
    post_tracking_url?: string;
}

function itemTitle(i: { name: string }) {
    return String(i.name || "").trim();
}

export function buildTags(order: OrderLike, origin: string, vendor?: VendorItems): Record<string, string> {
    const bill = order.billing || {};
    const ship = order.shipping || {};
    const items = order.items || [];
    const names = items.map(itemTitle);
    const namesQty = items.map((i) => `${itemTitle(i)} (${i.quantity})`);
    return {
        "{b_first_name}": String(bill.first_name || ""),
        "{b_last_name}": String(bill.last_name || ""),
        "{b_company}": String(bill.company || ""),
        "{b_address_1}": String(bill.address_1 || ""),
        "{b_address_2}": String(bill.address_2 || ""),
        "{b_state}": stateName(bill.country, bill.state),
        "{b_city}": String(bill.city || ""),
        "{b_postcode}": String(bill.postcode || ""),
        "{b_country}": countryName(bill.country),
        "{sh_first_name}": String(ship.first_name || ""),
        "{sh_last_name}": String(ship.last_name || ""),
        "{sh_company}": String(ship.company || ""),
        "{sh_address_1}": String(ship.address_1 || ""),
        "{sh_address_2}": String(ship.address_2 || ""),
        "{sh_state}": stateName(ship.country || bill.country, ship.state || bill.state),
        "{sh_city}": String(ship.city || bill.city || ""),
        "{sh_postcode}": String(ship.postcode || ""),
        "{sh_country}": countryName(ship.country || bill.country),
        "{phone}": modifyMobile(bill.phone || ""),
        "{mobile}": modifyMobile(bill.phone || ""),
        "{email}": String(bill.email || ""),
        "{order_id}": String(order.number ?? order.id),
        "{post_id}": String(order.id),
        "{date}": jalaliDateTime(order.paid_at || order.created_at),
        "{status}": statusLabel(order.status),
        "{price}": "",
        "{all_items}": names.join(" - "),
        "{all_items_full}": names.join(" - "),
        "{all_items_qty}": namesQty.join(" - "),
        "{count_items}": String(names.length),
        "{vendor_name}": String(vendor?.vendor_name || ""),
        "{vendor_items}": (vendor?.items || []).join(" - "),
        "{vendor_items_qty}": (vendor?.items_qty || []).join(" - "),
        "{count_vendor_items}": String((vendor?.items || []).length),
        "{vendor_price}": "",
        "{transaction_id}": String(order.transaction_id || ""),
        "{payment_method}": String(order.payment_method_title || order.payment_method || ""),
        "{payment_url}": `${origin}/purchase/receipt/${order.id}?key=${encodeURIComponent(order.access_token || "")}`,
        "{shipping_method}": String(order.shipping_method_title || order.shipping_method || ""),
        "{post_tracking_code}": String(vendor?.post_tracking_code || ""),
        "{post_tracking_url}": String(vendor?.post_tracking_url || "https://radgir.net"),
        "{description}": String(order.customer_note || ""),
    };
}

export async function replaceOrderShortCodes(content: string, status: string, order: OrderLike, origin: string, vendor?: VendorItems): Promise<string> {
    const settings = await getShopSettings();
    const tags = buildTags(order, origin, vendor);
    tags["{status}"] = statusLabel(status);
    tags["{price}"] = money(order.total, settings);
    const vendorTotal = (vendor?.prices || []).reduce((a, b) => a + Number(b || 0), 0);
    tags["{vendor_price}"] = money(vendorTotal, settings);
    return applyTags(content, tags);
}

export interface ProductLike {
    id: number;
    name: string;
    slug: string;
    sku?: string;
    regular_price?: number | null;
    sale_price?: number | null;
    price?: number | null;
    stock_quantity?: number | null;
    parent_id?: number;
    stock_status?: string;
}

export function productUrl(origin: string, product: ProductLike): string {
    return `${origin}/collection/items/${product.slug}`;
}

// replace_tags(): product-level shortcodes used by the newsletter and stock texts.
export async function replaceProductTags(content: string, product: ProductLike, parent: ProductLike, origin: string): Promise<string> {
    const settings = await getShopSettings();
    const sku = String(product.sku || parent.sku || "");
    const tags: Record<string, string> = {
        "{product_id}": String(parent.id),
        "{product_url}": productUrl(origin, product),
        "{sku}": sku,
        "{product_title}": String(parent.name || product.name || ""),
        "{product_title_full}": String(product.name || ""),
        "{regular_price}": money(Number(product.regular_price || 0), settings),
        "{onsale_price}": money(Number(product.sale_price ?? product.price ?? 0), settings),
        "{onsale_from}": "",
        "{onsale_to}": "",
        "{stock}": String(product.stock_quantity ?? ""),
    };
    const saleFrom = await getProductSmsMeta(parent.id, "sale_price_dates_from");
    const saleTo = await getProductSmsMeta(parent.id, "sale_price_dates_to");
    tags["{onsale_from}"] = saleFrom ? jalaliDateTime(saleFrom) : "";
    tags["{onsale_to}"] = saleTo ? jalaliDateTime(saleTo) : "";
    return applyTags(content, tags).replace(/<br\s*\/?>/gi, "\n");
}

/* ----------------------------- archive ----------------------------- */

export async function insertSmsArchive(data: {
    post_id?: number;
    post_type?: string;
    type?: number;
    reciever: string;
    message: string;
    sender: string;
    result: string;
}) {
    await getDb().execute("INSERT INTO sms_archive (post_id,post_type,type,reciever,message,sender,result,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", Number(data.post_id || 0), String(data.post_type || ""), Number(data.type || 0), data.reciever, data.message, data.sender, data.result, new Date().toISOString());
}

// remove_sent_mobiles(): suppress repeats of the same event within 24 hours.
export async function removeSentMobiles(mobiles: string[], type: number, postId: number, postType = "product"): Promise<string[]> {
    if (!mobiles.length)
        return [];
    const rows = (await getDb().many("SELECT reciever FROM sms_archive WHERE type=$1 AND post_id=$2 AND post_type=$3 AND created_at >= $4", type, postId, postType, new Date(Date.now() - 86400000).toISOString()));
    const sent = new Set<string>();
    for (const r of rows) {
        for (const m of String(r.reciever || "").split(","))
            sent.add(m.trim());
    }
    return mobiles.filter((m) => !sent.has(m));
}
