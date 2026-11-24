import { listMenus, createMenu, getMenu } from "@/lib/menus";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    return ok((await listMenus()));
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    if (!body.name)
        return fail("Menu name is required");
    const id = (await createMenu(body.name, body.location || ""));
    return ok((await getMenu(id)), 201);
}
