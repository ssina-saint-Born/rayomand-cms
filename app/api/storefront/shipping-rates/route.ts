import { ok } from "@/lib/api";
import { cartKey } from "@/lib/shop/cartKey";
import { cartLines, computeTotals, getCart } from "@/lib/shop/cart";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-price the cart for a destination and return the available shipping rates
// plus the resulting totals. Used by the checkout page while the buyer types.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const destination = {
    country: p.get("country") || undefined,
    state: p.get("state") || undefined,
    city: p.get("city") || undefined,
    postcode: p.get("postcode") || undefined,
  };
  const key = cartKey();
  const totals = await computeTotals(key, await cartLines(key), {
    destination,
    shippingMethodId: p.get("shipping_method_id") ? Number(p.get("shipping_method_id")) : undefined,
    legacy: p.get("shipping_method") || undefined,
  });
  return ok({ totals, cart: await getCart(key) });
}
