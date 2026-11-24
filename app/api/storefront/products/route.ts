import { ok, num } from "@/lib/api";
import { listProducts } from "@/lib/shop/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const p = new URL(req.url).searchParams;
    const result = (await listProducts({
        search: p.get("search") || undefined,
        category: p.get("category") || undefined,
        tag: p.get("tag") || undefined,
        featured: p.get("featured") === "1",
        onSale: p.get("on_sale") === "1",
        free: p.get("free") === "1",
        orderby: p.get("orderby") || "date",
        order: p.get("order") || "desc",
        page: num(p.get("page")),
        perPage: num(p.get("per_page")),
        visibility: true,
        status: "publish",
    }));
    return ok(result);
}
