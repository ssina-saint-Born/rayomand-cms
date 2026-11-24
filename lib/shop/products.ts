import { getDb, now, withTransaction } from "../db";
import { parseJson } from "./core";
export interface ProductFile {
    name: string;
    file: string;
}
export interface ProductImage {
    id?: number;
    src: string;
    alt?: string;
}
export interface ShopProduct {
    id: number;
    type: string;
    parent_id: number;
    name: string;
    slug: string;
    description: string;
    short_description: string;
    status: string;
    sku: string;
    regular_price: number | null;
    sale_price: number | null;
    price: number | null;
    stock_status: string;
    stock_quantity: number | null;
    manage_stock: number;
    virtual: number;
    downloadable: number;
    featured: number;
    catalog_visibility: string;
    weight: string;
    length: string;
    width: string;
    height: string;
    shipping_class: string;
    tax_class: string;
    images: ProductImage[];
    attributes: any[];
    default_attributes: any[];
    children: number[];
    files: ProductFile[];
    download_limit: number;
    download_expiry: number;
    tax_status: string;
    rating_count: number;
    average_rating: number;
    total_sales: number;
    created_at: string;
    updated_at: string;
    categories?: {
        id: number;
        name: string;
        slug: string;
    }[];
    tags?: {
        id: number;
        name: string;
        slug: string;
    }[];
    variations?: ShopProduct[];
    grouped?: ShopProduct[];
    free_download?: boolean;
    on_sale?: boolean;
    download_count?: number;
}
export function slugify(s: string): string {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
}
async function termsFor(productId: number, taxonomy: string) {
    return (await getDb().many("SELECT t.id, t.name, t.slug FROM terms t JOIN term_relationships r ON r.term_id=t.id WHERE r.post_id=$1 AND t.taxonomy=$2 ORDER BY t.name", productId, taxonomy));
}
export async function hydrateProduct(row: any, opts: {
    relations?: boolean;
} = {}): Promise<ShopProduct> {
    const p: ShopProduct = {
        ...row,
        images: parseJson(row.images, []),
        attributes: parseJson(row.attributes, []),
        default_attributes: parseJson(row.default_attributes, []),
        children: parseJson(row.children, []),
        files: parseJson(row.files, []),
        regular_price: row.regular_price == null ? null : Number(row.regular_price),
        sale_price: row.sale_price == null ? null : Number(row.sale_price),
        price: row.price == null ? null : Number(row.price),
        stock_quantity: row.stock_quantity == null ? null : Number(row.stock_quantity),
        rating_count: Number(row.rating_count || 0),
        average_rating: Number(row.average_rating || 0),
        total_sales: Number(row.total_sales || 0),
    };
    p.on_sale = p.sale_price != null && p.regular_price != null && p.sale_price < p.regular_price;
    p.free_download = isFreeDownloadable(p);
    p.download_count = Number(((await getDb().one("SELECT COUNT(*) c FROM downloads WHERE product_id=$1", p.id)) as any).c);
    if (opts.relations !== false) {
        p.categories = (await termsFor(p.id, "product_cat"));
        p.tags = (await termsFor(p.id, "product_tag"));
        if (p.type === "variable") {
            p.variations = (await Promise.all((await getDb().many("SELECT * FROM products WHERE parent_id=$1 AND type='variation' ORDER BY id", p.id)).map(async (r: any) => (await hydrateProduct(r, { relations: false })))));
        }
        if (p.type === "grouped") {
            p.grouped = (await Promise.all((await Promise.all(p.children.map(async (id) => (await getDb().one("SELECT * FROM products WHERE id=$1", id))))).filter(Boolean).map(async (r: any) => (await hydrateProduct(r, { relations: false })))));
        }
    }
    return p;
}
// Mirrors downloads_is_free_product: price empty/zero, downloadable, published.
export function isFreeDownloadable(p: {
    price?: number | null;
    downloadable?: number;
    status?: string;
    type?: string;
}): boolean {
    const price = p.price == null ? 0 : Number(p.price);
    return !!p.downloadable && price <= 0 && p.status === "publish" && p.type !== "grouped";
}
export async function getProduct(idOrSlug: number | string): Promise<ShopProduct | null> {
    const row = typeof idOrSlug === "number"
        ? (await getDb().one("SELECT * FROM products WHERE id=$1", idOrSlug)) : (await getDb().one("SELECT * FROM products WHERE slug=$1 OR id=$2", idOrSlug, Number(idOrSlug) || -1));
    return row ? (await hydrateProduct(row)) : null;
}
export async function listProducts(q: {
    search?: string;
    status?: string;
    type?: string;
    category?: string;
    tag?: string;
    featured?: boolean;
    onSale?: boolean;
    free?: boolean;
    include?: number[];
    exclude?: number[];
    orderby?: string;
    order?: string;
    page?: number;
    perPage?: number;
    visibility?: boolean;
}): Promise<{
    items: ShopProduct[];
    total: number;
    pages: number;
}> {
    const db = getDb();
    const where: string[] = ["type != 'variation'"];
    const params: unknown[] = [];
    if (q.status && q.status !== "any") {
        where.push(`status=$${params.length + 1}`);
        params.push(q.status);
    }
    else if (!q.status) {
        where.push("status='publish'");
    }
    if (q.type) {
        where.push(`type=$${params.length + 1}`);
        params.push(q.type);
    }
    if (q.search) {
        where.push(`(name LIKE $${params.length + 1} OR sku LIKE $${params.length + 2} OR description LIKE $${params.length + 3})`);
        const s = `%${q.search}%`;
        params.push(s, s, s);
    }
    if (q.featured)
        where.push("featured=1");
    if (q.onSale)
        where.push("sale_price IS NOT NULL AND regular_price IS NOT NULL AND sale_price < regular_price");
    if (q.free)
        where.push("downloadable=1 AND (price IS NULL OR price<=0)");
    if (q.include?.length) {
        where.push(`id IN (${q.include.map((_, i) => `$${params.length + i + 1}`).join(",")})`);
        params.push(...q.include);
    }
    if (q.exclude?.length) {
        where.push(`id NOT IN (${q.exclude.map((_, i) => `$${params.length + i + 1}`).join(",")})`);
        params.push(...q.exclude);
    }
    if (q.visibility)
        where.push("catalog_visibility != 'hidden'");
    if (q.category) {
        where.push(`id IN (SELECT r.post_id FROM term_relationships r JOIN terms t ON t.id=r.term_id WHERE t.taxonomy='product_cat' AND (t.slug=$${params.length + 1} OR t.id=$${params.length + 2}))`);
        params.push(q.category, Number(q.category) || -1);
    }
    if (q.tag) {
        where.push(`id IN (SELECT r.post_id FROM term_relationships r JOIN terms t ON t.id=r.term_id WHERE t.taxonomy='product_tag' AND (t.slug=$${params.length + 1} OR t.id=$${params.length + 2}))`);
        params.push(q.tag, Number(q.tag) || -1);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = ((await db.one(`SELECT COUNT(*) c FROM products ${whereSql}`, ...params)) as any).c;
    const sortMap: Record<string, string> = {
        date: "created_at", title: "name", price: "price", popularity: "total_sales",
        rating: "average_rating", menu_order: "id", modified: "updated_at",
    };
    const col = sortMap[q.orderby || "date"] || "created_at";
    const dir = (q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const perPage = Math.min(Number(q.perPage) || 12, 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const rows = (await db.many(`SELECT * FROM products ${whereSql} ORDER BY ${col} ${dir}, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, ...params, perPage, (page - 1) * perPage));
    return { items: (await Promise.all(rows.map(async (r: any) => (await hydrateProduct(r))))), total, pages: Math.max(1, Math.ceil(total / perPage)) };
}
const PRODUCT_COLS = [
    "type", "parent_id", "name", "slug", "description", "short_description", "status", "sku",
    "regular_price", "sale_price", "price", "stock_status", "stock_quantity", "manage_stock",
    "virtual", "downloadable", "featured", "catalog_visibility", "weight", "length", "width", "height",
    "shipping_class", "tax_class", "images", "attributes",
    "default_attributes", "children", "files", "download_limit", "download_expiry", "tax_status",
];
function normalizeInput(input: Record<string, any>, existing?: any) {
    const v: Record<string, any> = {};
    const src = { ...(existing || {}), ...input };
    v.type = src.type || "simple";
    v.parent_id = Number(src.parent_id || 0);
    v.name = String(src.name ?? "").trim();
    v.slug = src.slug ? slugify(String(src.slug)) : slugify(v.name);
    v.description = String(src.description ?? "");
    v.short_description = String(src.short_description ?? "");
    v.status = src.status || "publish";
    v.sku = String(src.sku ?? "");
    const reg = src.regular_price === "" || src.regular_price == null ? 0 : Number(src.regular_price);
    const sale = src.sale_price === "" || src.sale_price == null ? null : Number(src.sale_price);
    v.regular_price = reg;
    v.sale_price = sale;
    const pricesChanged = input.regular_price !== undefined || input.sale_price !== undefined;
    v.price = input.price != null && input.price !== "" ? Number(input.price) : pricesChanged ? sale ?? reg : src.price ?? sale ?? reg;
    if ([reg, sale, v.price].some((price) => price !== null && (!Number.isFinite(price) || price < 0)))
        throw new Error("Prices must be non-negative numbers.");
    v.stock_status = src.stock_status || "instock";
    v.stock_quantity = src.stock_quantity === "" || src.stock_quantity == null ? null : Number(src.stock_quantity);
    v.manage_stock = src.manage_stock ? 1 : 0;
    v.virtual = src.virtual ? 1 : 0;
    v.downloadable = src.downloadable ? 1 : 0;
    v.featured = src.featured ? 1 : 0;
    v.catalog_visibility = src.catalog_visibility || "visible";
    v.weight = String(src.weight ?? "");
    v.length = String(src.length ?? "");
    v.width = String(src.width ?? "");
    v.height = String(src.height ?? "");
    v.shipping_class = String(src.shipping_class ?? "").trim();
    v.tax_class = String(src.tax_class ?? "").trim();
    v.images = JSON.stringify(src.images ?? []);
    v.attributes = JSON.stringify(src.attributes ?? []);
    v.default_attributes = JSON.stringify(src.default_attributes ?? []);
    v.children = JSON.stringify(src.children ?? []);
    v.files = JSON.stringify(src.files ?? []);
    v.download_limit = Number(src.download_limit ?? -1);
    v.download_expiry = Number(src.download_expiry ?? -1);
    v.tax_status = src.tax_status || "taxable";
    return v;
}
export async function createProduct(input: Record<string, any>): Promise<ShopProduct> {
    return withTransaction(async () => {
        const db = getDb();
        const v = normalizeInput(input);
        if (!v.name)
            throw new Error("Product name is required.");
        const t = now();
        const cols = [...PRODUCT_COLS, "created_at", "updated_at"];
        const vals = cols.map((c) => (c === "created_at" || c === "updated_at" ? t : v[c]));
        const r = (await db.execute(`INSERT INTO products (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`, ...vals));
        const id = Number(r.id);
        (await syncTerms(id, input.categories, "product_cat"));
        (await syncTerms(id, input.tags, "product_tag"));
        return (await getProduct(id))!;
    });
}
export async function updateProduct(id: number, input: Record<string, any>): Promise<ShopProduct> {
    return withTransaction(async () => {
        const db = getDb();
        const existing = (await db.one("SELECT * FROM products WHERE id=$1", id));
        if (!existing)
            throw new Error("Product not found.");
        const ex = (await hydrateProduct(existing));
        const v = normalizeInput(input, {
            ...ex,
            regular_price: ex.regular_price, sale_price: ex.sale_price, price: ex.price,
            stock_quantity: ex.stock_quantity,
            images: input.images ?? ex.images, attributes: input.attributes ?? ex.attributes,
            default_attributes: input.default_attributes ?? ex.default_attributes,
            children: input.children ?? ex.children, files: input.files ?? ex.files,
        });
        const sets = PRODUCT_COLS.map((c, i) => `${c}=$${i + 1}`).join(",");
        (await db.execute(`UPDATE products SET ${sets}, updated_at=$${PRODUCT_COLS.length + 1} WHERE id=$${PRODUCT_COLS.length + 2}`, ...PRODUCT_COLS.map((c) => v[c]), now(), id));
        if (input.categories !== undefined)
            (await syncTerms(id, input.categories, "product_cat"));
        if (input.tags !== undefined)
            (await syncTerms(id, input.tags, "product_tag"));
        return (await getProduct(id))!;
    });
}
export async function syncTerms(productId: number, terms: any[] | undefined, taxonomy: string) {
    return withTransaction(async () => {
        if (terms === undefined)
            return;
        const db = getDb();
        const existing = (await db.many("SELECT r.term_id FROM term_relationships r JOIN terms t ON t.id=r.term_id WHERE r.post_id=$1 AND t.taxonomy=$2", productId, taxonomy)).map((r: any) => r.term_id);
        (await db.execute("DELETE FROM term_relationships WHERE post_id=$1 AND term_id = ANY($2::int[])", productId, existing));
        for (const t of terms) {
            let termId: number;
            if (typeof t === "number")
                termId = t;
            else if (t?.id)
                termId = Number(t.id);
            else if (t?.name) {
                const slug = slugify(String(t.name));
                const found = (await db.one("SELECT id FROM terms WHERE taxonomy=$1 AND slug=$2", taxonomy, slug));
                termId = found ? found.id : Number((await db.execute("INSERT INTO terms (taxonomy,name,slug,description,parent_id) VALUES ($1,$2,$3,'',0) RETURNING id", taxonomy, String(t.name), slug)).id);
            }
            else
                continue;
            (await db.execute("INSERT INTO term_relationships (post_id,term_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", productId, termId));
        }
    });
}
export async function deleteProduct(id: number) {
    return withTransaction(async () => {
        const db = getDb();
        (await db.execute("DELETE FROM term_relationships WHERE post_id=$1", id));
        (await db.execute("DELETE FROM products WHERE id=$1 OR parent_id=$2", id, id));
    });
}
export async function adjustStock(productId: number, delta: number) {
    return withTransaction(async () => {
        const db = getDb();
        const row = (await db.one("SELECT manage_stock, stock_quantity, stock_status FROM products WHERE id=$1 FOR UPDATE", productId));
        if (!row || !row.manage_stock || row.stock_quantity == null)
            return;
        const q = Number(row.stock_quantity) + delta;
        if (q < 0)
            throw new Error("Insufficient stock to fulfil this order.");
        (await db.execute("UPDATE products SET stock_quantity=$1, stock_status=$2 WHERE id=$3", q, q > 0 ? "instock" : "outofstock", productId));
    });
}
export async function bumpSales(productId: number, qty: number) {
    (await getDb().execute("UPDATE products SET total_sales=total_sales+$1 WHERE id=$2", qty, productId));
}
export async function refreshRating(productId: number) {
    const db = getDb();
    const agg = (await db.one("SELECT COUNT(*) c, AVG(rating) a FROM reviews WHERE product_id=$1 AND status='approved'", productId)) as any;
    (await db.execute("UPDATE products SET rating_count=$1, average_rating=$2 WHERE id=$3", agg.c || 0, agg.a ? Math.round(agg.a * 100) / 100 : 0, productId));
}
export async function productTerms(taxonomy: string) {
    return (await getDb().many("SELECT * FROM terms WHERE taxonomy=$1 ORDER BY name", taxonomy));
}
