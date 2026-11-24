import { getUser, updateUser, deleteUser } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { ok, fail, readBody, auth } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const u = (await currentUser());
    const id = Number(params.id);
    if (!u || (!isAdmin(u) && u.id !== id))
        return fail("Forbidden", 403);
    const user = (await getUser(id));
    if (!user)
        return fail("Not found", 404);
    return ok(user);
}
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const u = (await currentUser());
    const id = Number(params.id);
    if (!u || (!isAdmin(u) && u.id !== id))
        return fail("Forbidden", 403);
    if (!(await getUser(id)))
        return fail("Not found", 404);
    const body = await readBody(req);
    const data: any = {
        email: body.email,
        display_name: body.display_name,
        bio: body.bio,
    };
    if (isAdmin(u) && body.role)
        data.role = body.role;
    if (body.password)
        data.password_hash = hashPassword(String(body.password));
    (await updateUser(id, data));
    return ok((await getUser(id)));
}
export async function DELETE(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { user, res } = (await auth("administrator"));
    if (res)
        return res;
    const id = Number(params.id);
    if (id === user!.id)
        return fail("You cannot delete yourself");
    if (!(await getUser(id)))
        return fail("Not found", 404);
    (await deleteUser(id));
    return ok({ deleted: true, id });
}
