import { getMenu, updateMenu, deleteMenu, saveMenuItems } from "@/lib/menus";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const m = (await getMenu(Number(params.id)));
    if (!m)
        return fail("Not found", 404);
    return ok(m);
}
export async function PUT(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const id = Number(params.id);
    if (!(await getMenu(id)))
        return fail("Not found", 404);
    const body = await readBody(req);
    (await updateMenu(id, { name: body.name, location: body.location }));
    if (Array.isArray(body.items))
        (await saveMenuItems(id, body.items));
    return ok((await getMenu(id)));
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
    if (!(await getMenu(id)))
        return fail("Not found", 404);
    (await deleteMenu(id));
    return ok({ deleted: true, id });
}
