import { ok, fail, readBody, auth } from "@/lib/api";
import { refundOrder } from "@/lib/shop/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    try {
        return ok((await refundOrder(Number(params.id), Number(body.amount), String(body.reason || ""))), 201);
    }
    catch (e: any) {
        return fail(e.message);
    }
}
