import { ok, auth, readBody } from "@/lib/api";
import { sendBulkSms, mobilesForOrders } from "@/lib/shop/sms-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// GET ?orders=1,2,3 mirrors Bulk::handle_bulk_actions(): resolve the selected
// orders to their buyers' mobiles before opening the send form.
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const ids = String(new URL(req.url).searchParams.get("orders") || "").split(",").map(Number).filter((v) => Number.isFinite(v) && v > 0);
    return ok({ mobile: (await mobilesForOrders(ids)) });
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    const result = await sendBulkSms({ mobile: String(body.mobile || ""), message: String(body.message || "") });
    return ok(result, result.success ? 200 : 503);
}
