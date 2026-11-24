import fs from "node:fs";
import path from "node:path";
import { getMedia, updateMedia, deleteMedia } from "@/lib/media";
import { ok, fail, readBody, auth } from "@/lib/api";
import { canManage } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const m = (await getMedia(Number(params.id)));
    if (!m)
        return fail("Not found", 404);
    return ok(m);
}
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("author"));
    if (res)
        return res;
    const id = Number(params.id);
    if (!(await getMedia(id)))
        return fail("Not found", 404);
    const body = await readBody(req);
    (await updateMedia(id, { alt: body.alt, caption: body.caption, title: body.title }));
    return ok((await getMedia(id)));
}
export async function DELETE(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { user, res } = (await auth("author"));
    if (res)
        return res;
    const id = Number(params.id);
    const m = (await getMedia(id));
    if (!m)
        return fail("Not found", 404);
    if (!canManage(user!) && m.uploaded_by !== user!.id)
        return fail("Forbidden", 403);
    const file = path.join(UPLOAD_DIR, path.basename(m.stored_name));
    if (fs.existsSync(file))
        fs.unlinkSync(file);
    (await deleteMedia(id));
    return ok({ deleted: true, id });
}
