import { ok, fail, readBody, auth } from "@/lib/api";
import { deleteSubscriber, listSubscribers, subscribe, unsubscribe } from "@/lib/shop/people";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    return ok({ items: (await listSubscribers()) });
}
export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    const r = (await subscribe(String(body.email || ""), String(body.name || ""), "admin"));
    if (!r.ok)
        return fail("Invalid email address.");
    return ok({ items: (await listSubscribers()) });
}
export async function PATCH(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    (await unsubscribe(String(body.email || "")));
    return ok({ items: (await listSubscribers()) });
}
export async function DELETE(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const id = Number(new URL(req.url).searchParams.get("id"));
    (await deleteSubscriber(id));
    return ok({ items: (await listSubscribers()) });
}
