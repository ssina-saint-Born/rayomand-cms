import { ok, fail, readBody } from "@/lib/api";
import { cartKey } from "@/lib/shop/cartKey";
import { cartLines, getCart, setAppliedCoupon, validateCoupon, computeTotals } from "@/lib/shop/cart";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const body = await readBody(req);
    const key = cartKey();
    const lines = (await cartLines(key));
    const subtotal = lines.reduce((a, l) => a + l.line_subtotal, 0);
    const result = (await validateCoupon(String(body.code || ""), lines, subtotal));
    if (!result.ok)
        return fail(result.error);
    (await setAppliedCoupon(key, result.coupon.code));
    return ok((await getCart(key)));
}
export async function DELETE() {
    const key = cartKey();
    (await setAppliedCoupon(key, null));
    const lines = (await cartLines(key));
    return ok({ ...(await getCart(key)), totals: (await computeTotals(key, lines)) });
}
