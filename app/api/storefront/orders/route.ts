import { ok, fail } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { customerOrders } from "@/lib/shop/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const user = (await currentUser());
    if (!user)
        return fail("Unauthorized", 401);
    return ok({ items: (await customerOrders(user.id)) });
}
