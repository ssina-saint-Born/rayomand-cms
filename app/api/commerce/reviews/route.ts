import { ok, auth, num } from "@/lib/api";
import { listReviews } from "@/lib/shop/people";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    return ok({ items: (await listReviews({ productId: num(p.get("product_id")), status: p.get("status") || "any" })) });
}
