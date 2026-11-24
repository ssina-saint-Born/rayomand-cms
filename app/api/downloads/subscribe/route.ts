import { ok, fail, readBody } from "@/lib/api";
import { getDownloadsSettings } from "@/lib/shop/core";
import { subscribe } from "@/lib/shop/people";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const som = (await getDownloadsSettings());
    if (!som.newsletter_enable)
        return fail("Newsletter signup is disabled.");
    const body = await readBody(req);
    const r = (await subscribe(String(body.email || ""), String(body.name || ""), "newsletter"));
    if (!r.ok)
        return fail("Please enter a valid email address.");
    return ok({ ok: true, already: !!r.already });
}
