import { ok, fail, readBody, auth } from "@/lib/api";
import { addOrderNote } from "@/lib/shop/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { user, res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    try {
        return ok((await addOrderNote(Number(params.id), String(body.content || ""), user!.username, !!body.is_customer_note)), 201);
    }
    catch (e: any) {
        return fail(e.message);
    }
}
