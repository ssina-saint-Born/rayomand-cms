import { ok, auth, num } from "@/lib/api";
import { listOrders } from "@/lib/shop/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    return ok((await listOrders({
        status: p.get("status") || "any",
        customer: num(p.get("customer")),
        search: p.get("search") || undefined,
        page: num(p.get("page")),
        perPage: num(p.get("per_page")) || 20,
    })));
}
