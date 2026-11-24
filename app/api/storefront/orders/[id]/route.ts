import { timingSafeEqual } from "node:crypto";
import { ok, fail } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getOrder } from "@/lib/shop/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const order = (await getOrder(Number(params.id) || params.id));
    if (!order)
        return fail("Order not found.", 404);
    const user = (await currentUser());
    const key = new URL(req.url).searchParams.get("key") || "";
    const owns = user && order.customer_id === user.id;
    const access = Buffer.from(order.access_token || "");
    const provided = Buffer.from(key);
    const validKey = access.length > 0 && provided.length === access.length && timingSafeEqual(access, provided);
    if (!owns && !validKey && !(user && user.role === "administrator"))
        return fail("Forbidden", 403);
    return ok(order);
}
