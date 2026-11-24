import { ok, fail, readBody } from "@/lib/api";
import { cartKey } from "@/lib/shop/cartKey";
import { addToCart, clearCart, getCart, removeFromCart, setCartQuantity, TotalsContext } from "@/lib/shop/cart";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read the destination + method hint a client may send when pricing the cart.
function totalsFromQuery(url: URL): TotalsContext {
    const d = url.searchParams;
    const methodId = d.get("shipping_method_id");
    return {
        destination: {
            country: d.get("country") || undefined,
            state: d.get("state") || undefined,
            city: d.get("city") || undefined,
            postcode: d.get("postcode") || undefined,
        },
        shippingMethodId: methodId ? Number(methodId) : undefined,
        legacy: d.get("shipping_method") || undefined,
    };
}
export async function GET(req: Request) {
    const url = new URL(req.url);
    return ok((await getCart(cartKey(), totalsFromQuery(url))));
}
export async function POST(req: Request) {
    const body = await readBody(req);
    try {
        (await addToCart(cartKey(), Number(body.product_id), Number(body.quantity || 1), Number(body.variation_id || 0)));
        return ok((await getCart(cartKey())));
    }
    catch (e: any) {
        return fail(e.message);
    }
}
export async function PATCH(req: Request) {
    const body = await readBody(req);
    try {
        (await setCartQuantity(cartKey(), Number(body.product_id), Number(body.variation_id || 0), Number(body.quantity)));
        return ok((await getCart(cartKey())));
    }
    catch (e: any) {
        return fail(e.message);
    }
}
export async function DELETE(req: Request) {
    const url = new URL(req.url);
    const key = cartKey();
    if (url.searchParams.get("clear") === "1")
        (await clearCart(key));
    else
        (await removeFromCart(key, Number(url.searchParams.get("product_id")), Number(url.searchParams.get("variation_id") || 0)));
    return ok((await getCart(key)));
}
