import { ok, fail, readBody, auth } from "@/lib/api";
import { deleteReview, setReviewStatus } from "@/lib/shop/people";
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
    const body = await readBody(req);
    try {
        (await setReviewStatus(Number(params.id), String(body.status)));
        return ok({ updated: true });
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
    (await deleteReview(Number(params.id)));
    return ok({ deleted: true });
}
