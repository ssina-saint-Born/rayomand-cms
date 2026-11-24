import { ok, fail, readBody, auth } from "@/lib/api";
import { listCoupons, saveCoupon } from "@/lib/shop/cart";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    return ok({ items: (await listCoupons()) });
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    try {
        return ok((await saveCoupon(await readBody(req))), 201);
    }
    catch (e: any) {
        return fail(e.message);
    }
}
