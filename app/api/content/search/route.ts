import { listPosts } from "@/lib/posts";
import { ok, num } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || url.searchParams.get("s") || "";
    if (!search.trim())
        return ok({ items: [], total: 0 });
    const posts = (await listPosts({ type: "post", status: "publish", search, perPage: 20 }));
    const pages = (await listPosts({ type: "page", status: "publish", search, perPage: 20 }));
    const items = [
        ...posts.items.map((p) => ({ id: p.id, title: p.title, url: `/read/${p.slug}`, type: "post" })),
        ...pages.items.map((p) => ({ id: p.id, title: p.title, url: `/read/${p.slug}`, type: "page" })),
    ];
    return ok({ items, total: items.length });
}
