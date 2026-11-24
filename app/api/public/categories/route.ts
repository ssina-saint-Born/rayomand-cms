import { listTerms } from "@/lib/terms";
import { getSettings } from "@/lib/options";
import { resolveActiveTheme } from "@/lib/theme/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(): Record<string, string> {
    return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
}

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: cors() });
}

export async function GET() {
    const settings = await getSettings();
    const { theme } = await resolveActiveTheme(settings.theme);
    const [categories, tags] = await Promise.all([listTerms("category"), listTerms("tag")]);
    return Response.json({
        site: { title: settings.site_title, tagline: settings.tagline },
        theme: { slug: theme.slug, tokens: theme.tokens, layout: theme.layout },
        categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, count: c.count })),
        tags: tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name, count: t.count })),
    }, { headers: cors() });
}
