import { ok, fail, readBody, auth } from "@/lib/api";
import { getOrder, setOrderStatus } from "@/lib/shop/orders";
import { dispatchOrderSms } from "@/lib/shop/sms-events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const order = (await getOrder(Number(params.id)));
    if (!order)
        return fail("Order not found.", 404);
    return ok(order);
}
// PATCH updates the status, and mirrors the plugin's order metabox: when
// `sms_send` is set the message (or the status template) also goes out.
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { user, res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    const id = Number(params.id);
    const previous = await getOrder(id);
    if (!previous)
        return fail("Order not found.", 404);
    const status = body.status != null ? String(body.status) : previous.status;
    const origin = new URL(req.url).origin;
    try {
        const changed = status !== previous.status;
        let order = previous;
        if (body.status != null)
            order = await setOrderStatus(id, status, user!.username);

        let sms: any = null;
        if (body.sms_send) {
            sms = await dispatchOrderSms({
                orderId: id,
                trigger: "manual",
                newStatus: status,
                manualMessage: body.sms_text != null ? String(body.sms_text) : undefined,
                manualToCustomer: true,
                origin,
            });
        }
        else if (changed) {
            sms = await dispatchOrderSms({ orderId: id, trigger: "status", oldStatus: previous.status, newStatus: status, origin });
        }
        return ok({ ...order, sms });
    }
    catch (e: any) {
        return fail(e.message);
    }
}
