import { ok, auth, num } from "@/lib/api";
import { listPosts } from "@/lib/posts";
import { hasRole } from "@/lib/auth";
import type { PostStatus, PostType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Content feed for the mobile app. Unlike /api/public (anonymous, published
// only), this is authenticated: an author sees their own drafts, an editor sees
// everything. The `status` filter is clamped to what the role may read.
export async function GET(req: Request) {
    const { user, res } = await auth("contributor");
    if (res)
        return res;
    const url = new URL(req.url);
    const requested = (url.searchParams.get("status") || "") as PostStatus | "any" | "trash" | "";

    // Contributors may only see their own posts and never others' drafts.
    const canSeeAll = hasRole(user!, "editor");
    const status = !canSeeAll && (!requested || requested === "any")
        ? "any"
        : (requested || undefined);

    const result = await listPosts({
        type: (url.searchParams.get("type") as PostType) || "post",
        status: canSeeAll ? (status as any) : "any",
        author: canSeeAll ? num(url.searchParams.get("author")) : user!.id,
        search: url.searchParams.get("q") || undefined,
        page: num(url.searchParams.get("page")) || 1,
        perPage: Math.min(num(url.searchParams.get("per_page")) || 20, 50),
    });

    // Strip other authors' drafts for non-editors even if the query let them in.
    const items = canSeeAll
        ? result.items
        : result.items.filter((p) => p.author_id === user!.id || p.status === "publish");

    return ok({
        items: items.map((p) => ({
            id: p.id, type: p.type, title: p.title, slug: p.slug, status: p.status,
            excerpt: p.excerpt, author_id: p.author_id, updated_at: p.updated_at,
            published_at: p.published_at,
        })),
        total: result.total,
    });
}
