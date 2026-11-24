import { ok, readBody } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { subscribeNewsletter } from "@/lib/shop/sms-newsletter";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Mirrors POST pwsms/notification/subscribe.
export async function POST(req: Request) {
    const body = await readBody(req);
    const user = await currentUser();
    const result = await subscribeNewsletter({
        productId: Number(body.product_id || 0),
        mobile: String(body.sms_mobile || ""),
        groups: body.sms_group ?? body.groups,
        loggedIn: !!user,
    });
    const payload = { success: result.ok, message: result.message };
    return ok(payload, result.status);
}
