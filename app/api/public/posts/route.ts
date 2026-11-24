import { listPosts } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import { blocksToPlainText } from "@/lib/blocks";
import { getLocale } from "@/lib/i18n-server";

// Headless route 3: a read-only JSON API for a separate frontend. It exposes
// the same published content the declarative theme renders, plus the active
// theme tokens so a client can mirror the palette. Nothing here is
// authenticated; only published posts and public settings are returned.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: cors() });
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("perPage") || "10", 10) || 10));
    const search = (url.searchParams.get("q") || "").trim();
    const category = parseInt(url.searchParams.get("category") || "", 10) || undefined;
    const tag = parseInt(url.searchParams.get("tag") || "", 10) || undefined;

    const settings = await getSettings();
    const { theme } = await resolveActiveTheme(settings.theme);
    const { items, total } = await listPosts({
        type: "post", status: "publish", page, perPage, search: search || undefined, category, tag,
    });

    return Response.json({
        site: { title: settings.site_title, tagline: settings.tagline, locale: getLocale() },
        theme: { slug: theme.slug, tokens: theme.tokens, layout: theme.layout },
        page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)),
        posts: items.map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt || blocksToPlainText(p.content).slice(0, 240),
            url: `/read/${p.slug}`,
            published_at: p.published_at,
            updated_at: p.updated_at,
            author: p.author ? { name: p.author.display_name, username: p.author.username } : null,
            categories: (p.categories || []).map((c) => ({ slug: c.slug, name: c.name })),
            tags: (p.tags || []).map((t) => ({ slug: t.slug, name: t.name })),
            featured_image: p.featured_media?.url || null,
        })),
    }, { headers: cors() });
}
