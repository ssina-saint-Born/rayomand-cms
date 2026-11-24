import { getPostBySlug } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import { getLocale } from "@/lib/i18n-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(): Record<string, string> {
    return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
}

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: cors() });
}

// Single-item headless read. Only published content is exposed; private and
// scheduled posts return 404 so the public API can't leak them.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
    const post = (await getPostBySlug(params.slug, "post")) || (await getPostBySlug(params.slug, "page"));
    if (!post || post.status !== "publish")
        return Response.json({ error: "Not found" }, { status: 404, headers: cors() });

    const settings = await getSettings();
    const { theme } = await resolveActiveTheme(settings.theme);

    return Response.json({
        theme: { slug: theme.slug, tokens: theme.tokens },
        site: { title: settings.site_title, locale: getLocale() },
        post: {
            id: post.id,
            type: post.type,
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            // Blocks are the canonical content; a client renders them or reads
            // `html` if it only needs a flat view.
            blocks: post.content,
            html: null,
            published_at: post.published_at,
            updated_at: post.updated_at,
            author: post.author ? { name: post.author.display_name, username: post.author.username, bio: post.author.bio } : null,
            categories: (post.categories || []).map((c) => ({ slug: c.slug, name: c.name })),
            tags: (post.tags || []).map((t) => ({ slug: t.slug, name: t.name })),
            featured_image: post.featured_media?.url || null,
        },
    }, { headers: cors() });
}
