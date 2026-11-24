import { normalizeTheme, toActiveTheme } from "@/lib/theme/spec";
import { listPacks, savePacks, getPack, type StoredPack } from "@/lib/theme/store";
import { ok, fail, readBody, auth } from "@/lib/api";
import { now } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Install a declarative theme pack. The payload is a JSON document shaped like
// lib/theme/spec.ts's DeclarativeTheme; it is normalized (and therefore
// sanitized) before it is stored, so a malformed or hostile pack can never
// reach the renderer.

export async function GET() {
    const packs = await listPacks();
    return ok(packs.map((p) => ({
        slug: p.slug, name: p.name, description: p.description, version: p.version,
        license: p.license || "free", product: p.product, installed_at: p.installed_at,
    })));
}

export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    let raw: any = body.pack ?? body;
    if (typeof raw === "string") {
        try {
            raw = JSON.parse(raw);
        }
        catch {
            return fail("The theme file is not valid JSON.");
        }
    }
    if (!raw || typeof raw !== "object")
        return fail("Send a JSON theme document.");
    const spec = normalizeTheme(raw);
    if (!spec.slug || spec.slug === "custom")
        return fail("The theme needs a valid slug.");
    if (!spec.name || spec.name === "Custom theme")
        return fail("The theme needs a name.");

    const packs = await listPacks();
    const existing = packs.find((p) => p.slug === spec.slug);
    const stored: StoredPack = {
        ...spec,
        installed_at: existing?.installed_at || now(),
    };
    const next = existing ? packs.map((p) => (p.slug === spec.slug ? stored : p)) : [...packs, stored];
    await savePacks(next);
    return ok({ installed: spec.slug, replaced: !!existing, theme: toActiveTheme(spec, "declarative") });
}

export async function DELETE(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const slug = new URL(req.url).searchParams.get("slug") || "";
    const packs = await listPacks();
    if (!packs.some((p) => p.slug === slug))
        return fail("That theme pack is not installed.", 404);
    await savePacks(packs.filter((p) => p.slug !== slug));
    return ok({ removed: slug });
}
