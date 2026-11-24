import { listAllThemes, activateTheme } from "@/lib/theme/resolve";
import { getActiveSlug, getEngineMode } from "@/lib/theme/store";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const themes = await listAllThemes();
    return ok({
        themes,
        active: await getActiveSlug(),
        engine: await getEngineMode(),
    });
}

export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    const slug = String(body.activate || "");
    if (!slug)
        return fail("Choose a theme to activate.");
    const result = await activateTheme(slug);
    if (!result.ok)
        return fail(result.message);
    return ok({ activated: slug });
}
