import { getComment, setCommentStatus, deleteComment } from "@/lib/comments";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const c = (await getComment(Number(params.id)));
    if (!c)
        return fail("Not found", 404);
    return ok(c);
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
    if (!(await getComment(id)))
        return fail("Not found", 404);
    const body = await readBody(req);
    if (body.status)
        (await setCommentStatus(id, body.status));
    return ok((await getComment(id)));
}
export async function DELETE(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const id = Number(params.id);
    if (!(await getComment(id)))
        return fail("Not found", 404);
    (await deleteComment(id));
    return ok({ deleted: true, id });
}
