import { ok, fail, readBody, auth } from "@/lib/api";
import { deleteProduct, getProduct, updateProduct } from "@/lib/shop/products";
import { dispatchProductSaveSms } from "@/lib/shop/sms-events";
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
    const product = (await getProduct(Number(params.id)));
    if (!product)
        return fail("Product not found.", 404);
    return ok(product);
}
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const id = Number(params.id);
    const previous = await getProduct(id);
    try {
        const saved = await updateProduct(id, await readBody(req));
        await dispatchProductSaveSms(previous, saved);
        return ok(saved);
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
    (await deleteProduct(Number(params.id)));
    return ok({ deleted: true });
}
