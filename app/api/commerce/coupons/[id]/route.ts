import { ok, fail, readBody, auth } from "@/lib/api";
import { deleteCoupon, saveCoupon } from "@/lib/shop/cart";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    try {
        return ok((await saveCoupon(await readBody(req), Number(params.id))));
    }
    catch (e: any) {
        return fail(e.message);
    }
}
export async function DELETE(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    (await deleteCoupon(Number(params.id)));
    return ok({ deleted: true });
}
