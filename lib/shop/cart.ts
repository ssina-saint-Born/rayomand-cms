import { getDb, now, withTransaction } from "../db";
import { getShopSettings, parseJson, round2 } from "./core";
import { getProduct, ShopProduct } from "./products";
import { availableShippingRates, Destination, PackageLine, ShippingRate } from "./shipping";
import { computeTaxFor, listTaxRates, matchingTaxRates, TaxLine } from "./tax";
export interface CartLine {
    cart_key: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    product: ShopProduct;
    unit_price: number;
    line_subtotal: number;
    line_total: number;
}
export interface TotalsContext {
    destination?: Destination;
    // Chosen zone-method id (preferred). `legacy` keeps the old
    // pickup/flat/free selector working when no shipping zones are configured.
    shippingMethodId?: number;
    legacy?: string;
}
export interface CartTotals {
    subtotal: number;
    discount_total: number;
    shipping_total: number;
    tax_total: number;
    total: number;
    coupon_code: string | null;
    free_shipping: boolean;
    needs_shipping: boolean;
    shipping_method_id: number;
    shipping_label: string;
    shipping_zone: string;
    shipping_tax: number;
    tax_lines: TaxLine[];
    available_shipping: ShippingRate[];
}
export interface CartView {
    key: string;
    items: CartLine[];
    totals: CartTotals;
    count: number;
}
export async function getAppliedCoupon(key: string): Promise<string | null> {
    const row = (await getDb().one("SELECT value FROM options WHERE name=$1", `shop_cart_coupon_${key}`));
    return row ? row.value : null;
}
export async function setAppliedCoupon(key: string, code: string | null) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "cart:" + key);
        const db = getDb();
        if (code)
            (await db.execute("INSERT INTO options (name,value) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value", `shop_cart_coupon_${key}`, code));
        else
            (await db.execute("DELETE FROM options WHERE name=$1", `shop_cart_coupon_${key}`));
    });
}
export async function cartLines(key: string): Promise<CartLine[]> {
    const rows = (await getDb().many("SELECT * FROM cart_items WHERE cart_key=$1 ORDER BY created_at, product_id, variation_id", key));
    const lines: CartLine[] = [];
    for (const r of rows) {
        const product = (await getProduct(r.variation_id || r.product_id));
        if (!product)
            continue;
        const parent = r.variation_id ? (await getProduct(r.product_id)) : null;
        const shown = parent ? { ...product, name: `${parent.name} — ${product.attributes?.map((a: any) => a.option).join(", ") || product.name}` } : product;
        const unit = Number(product.price ?? 0);
        lines.push({
            cart_key: r.cart_key, product_id: r.product_id, variation_id: r.variation_id,
            quantity: Number(r.quantity), product: shown, unit_price: unit,
            line_subtotal: round2(unit * Number(r.quantity)), line_total: round2(unit * Number(r.quantity)),
        });
    }
    return lines;
}
export async function addToCart(key: string, productId: number, quantity: number, variationId = 0) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "cart:" + key);
        const db = getDb();
        const product = (await getProduct(variationId || productId));
        if (!product)
            throw new Error("Product not found.");
        if (variationId) {
            const parent = await getProduct(productId);
            if (product.type !== "variation" || product.parent_id !== productId || parent?.status !== "publish") throw new Error("Invalid product variation.");
        }
        if (product.status !== "publish")
            throw new Error("This product is not available.");
        if (product.stock_status === "outofstock")
            throw new Error("This product is out of stock.");
        if (product.type === "variable" && !variationId)
            throw new Error("Please choose a variation.");
        if (product.type === "grouped" || product.type === "external")
            throw new Error("This product cannot be added to the cart directly.");
        const qty = Math.max(1, Math.floor(quantity || 1));
        if (product.manage_stock && product.stock_quantity != null) {
            const existing = (await db.one("SELECT quantity FROM cart_items WHERE cart_key=$1 AND product_id=$2 AND variation_id=$3", key, productId, variationId));
            const inCart = existing ? Number(existing.quantity) : 0;
            if (inCart + qty > product.stock_quantity)
                throw new Error(`Only ${product.stock_quantity} left in stock.`);
        }
        (await db.execute("INSERT INTO cart_items (cart_key,product_id,variation_id,quantity,created_at) VALUES ($1,$2,$3,$4,$5)\n     ON CONFLICT(cart_key,product_id,variation_id) DO UPDATE SET quantity=cart_items.quantity+excluded.quantity", key, productId, variationId, qty, now()));
    });
}
export async function setCartQuantity(key: string, productId: number, variationId: number, quantity: number) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "cart:" + key);
        const db = getDb();
        const qty = Math.floor(quantity);
        if (qty <= 0) {
            (await db.execute("DELETE FROM cart_items WHERE cart_key=$1 AND product_id=$2 AND variation_id=$3", key, productId, variationId));
            return;
        }
        const product = (await getProduct(variationId || productId));
        if (product?.manage_stock && product.stock_quantity != null && qty > product.stock_quantity) {
            throw new Error(`Only ${product.stock_quantity} left in stock.`);
        }
        (await db.execute("UPDATE cart_items SET quantity=$1 WHERE cart_key=$2 AND product_id=$3 AND variation_id=$4", qty, key, productId, variationId));
    });
}
export async function removeFromCart(key: string, productId: number, variationId: number) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "cart:" + key);
        (await getDb().execute("DELETE FROM cart_items WHERE cart_key=$1 AND product_id=$2 AND variation_id=$3", key, productId, variationId));
    });
}
export async function clearCart(key: string) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "cart:" + key);
        (await getDb().execute("DELETE FROM cart_items WHERE cart_key=$1", key));
        (await setAppliedCoupon(key, null));
    });
}
// ---- Coupons ----
export async function getCouponByCode(code: string) {
    const row = (await getDb().one("SELECT * FROM coupons WHERE lower(code)=lower($1)", code.trim()));
    if (!row)
        return null;
    return { ...row, amount: Number(row.amount), product_ids: parseJson(row.product_ids, []), category_ids: parseJson(row.category_ids, []) };
}
export async function validateCoupon(code: string, lines: CartLine[], subtotal: number): Promise<{
    ok: true;
    coupon: any;
} | {
    ok: false;
    error: string;
}> {
    const s = (await getShopSettings());
    if (!s.enable_coupons)
        return { ok: false, error: "Coupons are disabled." };
    const coupon = (await getCouponByCode(code));
    if (!coupon)
        return { ok: false, error: `Coupon "${code}" does not exist.` };
    if (!coupon.enabled)
        return { ok: false, error: "This coupon is disabled." };
    if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date())
        return { ok: false, error: "This coupon has expired." };
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit)
        return { ok: false, error: "This coupon has reached its usage limit." };
    if (coupon.minimum_amount && subtotal < Number(coupon.minimum_amount))
        return { ok: false, error: `Minimum order amount for this coupon is ${coupon.minimum_amount}.` };
    if (coupon.maximum_amount && subtotal > Number(coupon.maximum_amount))
        return { ok: false, error: `Maximum order amount for this coupon is ${coupon.maximum_amount}.` };
    if (coupon.individual_use && (await getAppliedCoupon(lines[0]?.cart_key || ""))) {
        const current = (await getAppliedCoupon(lines[0].cart_key));
        if (current && current.toLowerCase() !== code.toLowerCase())
            return { ok: false, error: "This coupon cannot be used with other coupons." };
    }
    if (coupon.discount_type === "fixed_product" && coupon.product_ids.length) {
        const match = lines.some((l) => coupon.product_ids.includes(l.product_id));
        if (!match)
            return { ok: false, error: "This coupon does not apply to the products in your cart." };
    }
    return { ok: true, coupon };
}
export function couponDiscount(coupon: any, lines: CartLine[], subtotal: number): number {
    if (!coupon)
        return 0;
    if (coupon.discount_type === "percent")
        return round2(subtotal * (Number(coupon.amount) / 100));
    if (coupon.discount_type === "fixed_cart")
        return round2(Math.min(Number(coupon.amount), subtotal));
    if (coupon.discount_type === "fixed_product") {
        let d = 0;
        for (const l of lines) {
            if (!coupon.product_ids.length || coupon.product_ids.includes(l.product_id)) {
                d += Math.min(Number(coupon.amount), l.unit_price) * l.quantity;
            }
        }
        return round2(Math.min(d, subtotal));
    }
    return 0;
}
export async function computeTotals(key: string, lines: CartLine[], ctx?: TotalsContext): Promise<CartTotals> {
    const s = (await getShopSettings());
    const subtotal = round2(lines.reduce((a, l) => a + l.line_subtotal, 0));
    const code = (await getAppliedCoupon(key));
    let coupon: any = null;
    if (code) {
        const v = (await validateCoupon(code, lines, subtotal));
        if (v.ok)
            coupon = v.coupon;
        else
            (await setAppliedCoupon(key, null));
    }
    const discount = coupon ? couponDiscount(coupon, lines, subtotal) : 0;
    const afterDiscount = round2(subtotal - discount);
    const needsShipping = lines.some((l) => !l.product.virtual && !l.product.downloadable);

    const pkg: PackageLine[] = lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        line_total: l.line_total,
        shipping_class: l.product.shipping_class || "",
        weight: Number(l.product.weight || 0),
        needs_shipping: !l.product.virtual && !l.product.downloadable,
    }));

    const destination: Destination = ctx?.destination || {};
    const freeByCoupon = !!coupon?.free_shipping;
    const freeByMin = s.shipping_free_min > 0 && afterDiscount >= Number(s.shipping_free_min);

    let available: ShippingRate[] = [];
    let shipping = 0;
    let label = "";
    let zoneName = "";
    let methodId = 0;

    if (needsShipping) {
        if (destination.country || destination.state) {
            available = (await availableShippingRates(destination, pkg, afterDiscount));
        }
        if (freeByCoupon || freeByMin) {
            available = [{ method_id: 0, zone_id: 0, zone_name: "", method_type: "free_shipping", label: "Free shipping", cost: 0 }, ...available];
        }

        if (available.length) {
            // Honour the caller's explicit choice; otherwise the cheapest option.
            const picked = ctx?.shippingMethodId != null
                ? available.find((r) => r.method_id === ctx.shippingMethodId)
                : undefined;
            const chosen = picked || available.reduce((best, r) => (r.cost < best.cost ? r : best), available[0]);
            shipping = chosen.cost;
            label = chosen.label;
            zoneName = chosen.zone_name;
            methodId = chosen.method_id;
        }
        else {
            // No zone configured for this destination: fall back to the legacy
            // single-rate settings so existing stores keep working.
            const legacy = ctx?.legacy;
            if (legacy === "pickup" && s.shipping_pickup)
                shipping = 0, label = "Local pickup";
            else if (freeByCoupon || freeByMin)
                shipping = 0, label = "Free shipping";
            else if (Number(s.shipping_flat_cost || 0) > 0)
                shipping = Number(s.shipping_flat_cost), label = "Flat rate";
        }
    }

    // ---- Tax ----
    let tax = 0;
    let shippingTax = 0;
    const taxLines: TaxLine[] = [];
    if (s.calc_taxes) {
        const priceIncludesTax = !!Number(s.prices_include_tax);
        const allRates = await listTaxRates();
        const hasLocationRates = allRates.length > 0;

        if (hasLocationRates) {
            // Per-line: resolve rates by each product's tax class + destination.
            for (const l of lines) {
                if (l.product.tax_status !== "taxable") continue;
                const lineNet = subtotal > 0 ? l.line_subtotal * (afterDiscount / subtotal) : 0;
                const rates = await matchingTaxRates(l.product.tax_class || "", destination);
                const t = computeTaxFor(lineNet, rates, priceIncludesTax);
                tax += t.tax;
                for (const tl of t.lines) {
                    const ex = taxLines.find((x) => x.name === tl.name && x.rate === tl.rate);
                    if (ex) ex.amount = round2(ex.amount + tl.amount);
                    else taxLines.push({ ...tl });
                }
            }
            // Shipping tax uses the destination rates of the standard class.
            if (shipping > 0) {
                const rates = await matchingTaxRates("", destination).then((rs) => rs.filter((r) => r.shipping));
                const st = computeTaxFor(shipping, rates, priceIncludesTax);
                // Included-tax shipping cost is already gross; only add tax when exclusive.
                shippingTax = priceIncludesTax ? 0 : st.tax;
                for (const tl of st.lines) {
                    const ex = taxLines.find((x) => x.name === tl.name && x.rate === tl.rate && !priceIncludesTax);
                    if (ex) ex.amount = round2(ex.amount + tl.amount);
                    else if (!priceIncludesTax) taxLines.push({ ...tl });
                }
            }
        }
        else {
            // Legacy single-rate tax on the taxable subtotal.
            const taxableSubtotal = lines.filter((l) => l.product.tax_status === "taxable").reduce((sum, l) => sum + l.line_subtotal, 0);
            const taxable = subtotal > 0 ? taxableSubtotal * (afterDiscount / subtotal) : 0;
            const rate = Number(s.tax_rate || 0) / 100;
            tax = priceIncludesTax ? round2(taxable - taxable / (1 + rate)) : round2(taxable * rate);
        }
        tax = round2(tax);
    }

    const totalTax = round2(tax + shippingTax);
    const total = round2(Math.max(0, afterDiscount + shipping + (Number(s.prices_include_tax) ? shippingTax : totalTax)));

    return {
        subtotal, discount_total: discount, shipping_total: shipping, tax_total: totalTax, total,
        coupon_code: coupon ? coupon.code : null,
        free_shipping: freeByCoupon || freeByMin,
        needs_shipping: needsShipping,
        shipping_method_id: methodId,
        shipping_label: label,
        shipping_zone: zoneName,
        shipping_tax: shippingTax,
        tax_lines: taxLines,
        available_shipping: available,
    };
}
export async function getCart(key: string, ctx?: TotalsContext): Promise<CartView> {
    const items = (await cartLines(key));
    return { key, items, totals: (await computeTotals(key, items, ctx)), count: items.reduce((a, l) => a + l.quantity, 0) };
}
// ---- Coupon admin CRUD ----
export async function listCoupons() {
    return (await getDb().many("SELECT * FROM coupons ORDER BY id DESC")).map((r: any) => ({
        ...r, amount: Number(r.amount), product_ids: parseJson(r.product_ids, []), category_ids: parseJson(r.category_ids, []),
    }));
}
export async function saveCoupon(input: Record<string, any>, id?: number) {
    const db = getDb();
    const code = String(input.code || "").trim().toLowerCase();
    if (!code)
        throw new Error("Coupon code is required.");
    const v = {
        code,
        discount_type: input.discount_type || "percent",
        amount: Number(input.amount || 0),
        description: String(input.description ?? ""),
        usage_limit: Number(input.usage_limit || 0),
        individual_use: input.individual_use ? 1 : 0,
        free_shipping: input.free_shipping ? 1 : 0,
        minimum_amount: Number(input.minimum_amount || 0),
        maximum_amount: Number(input.maximum_amount || 0),
        product_ids: JSON.stringify(input.product_ids ?? []),
        category_ids: JSON.stringify(input.category_ids ?? []),
        expiry_date: input.expiry_date || null,
        enabled: input.enabled === false || input.enabled === 0 ? 0 : 1,
    };
    const cols = Object.keys(v);
    if (id) {
        const exists = (await db.one("SELECT id FROM coupons WHERE lower(code)=lower($1) AND id!=$2", code, id));
        if (exists)
            throw new Error("Coupon code already exists.");
        (await db.execute(`UPDATE coupons SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(",")} WHERE id=$${cols.length + 1}`, ...cols.map((c) => (v as any)[c]), id));
        return (await db.one("SELECT * FROM coupons WHERE id=$1", id));
    }
    const exists = (await db.one("SELECT id FROM coupons WHERE lower(code)=lower($1)", code));
    if (exists)
        throw new Error("Coupon code already exists.");
    const r = (await db.execute(`INSERT INTO coupons (${cols.join(",")},created_at) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")},$${cols.length + 1}) RETURNING id`, ...cols.map((c) => (v as any)[c]), now()));
    return (await db.one("SELECT * FROM coupons WHERE id=$1", Number(r.id)));
}
export async function deleteCoupon(id: number) {
    (await getDb().execute("DELETE FROM coupons WHERE id=$1", id));
}
