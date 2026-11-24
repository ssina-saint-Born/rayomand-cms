import { ok, fail, readBody, auth } from "@/lib/api";
import { getShopSettings, setShopSettings } from "@/lib/shop/core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    return ok((await getShopSettings()));
}
export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    if (!body || typeof body !== "object")
        return fail("Invalid settings payload.");
    return ok((await setShopSettings(body)));
}
