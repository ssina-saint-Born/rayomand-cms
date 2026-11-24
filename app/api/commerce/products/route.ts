import { ok, fail, readBody, auth, num } from "@/lib/api";
import { createProduct, listProducts } from "@/lib/shop/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    return ok((await listProducts({
        search: p.get("search") || undefined,
        status: p.get("status") || "any",
        type: p.get("type") || undefined,
        category: p.get("category") || undefined,
        orderby: p.get("orderby") || "date",
        order: p.get("order") || "desc",
        page: num(p.get("page")),
        perPage: num(p.get("per_page")) || 20,
    })));
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    try {
        return ok((await createProduct(await readBody(req))), 201);
    }
    catch (e: any) {
        return fail(e.message);
    }
}
