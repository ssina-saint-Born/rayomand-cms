import { listComments, createComment } from "@/lib/comments";
import { getPost } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { currentUser, canManage } from "@/lib/auth";
import { ok, fail, readBody, num } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const url = new URL(req.url);
    const u = (await currentUser());
    const status = canManage(u)
        ? url.searchParams.get("status") || "all"
        : "approved";
    const { items, total } = (await listComments({
        status,
        postId: num(url.searchParams.get("post")),
        page: num(url.searchParams.get("page")) || 1,
        perPage: num(url.searchParams.get("per_page")) || 20,
    }));
    return ok({ items, total });
}
export async function POST(req: Request) {
    const body = await readBody(req);
    const postId = Number(body.post || body.post_id);
    const post = (await getPost(postId));
    if (!post)
        return fail("Post not found", 404);
    if (post.comment_status !== "open")
        return fail("Comments are closed", 403);
    const content = String(body.content || "").trim();
    if (!content)
        return fail("Comment content is required");
    const u = (await currentUser());
    const settings = (await getSettings());
    const author_name = u ? u.display_name : String(body.author_name || "").trim();
    const author_email = u ? u.email : String(body.author_email || "").trim();
    if (!author_name || !author_email)
        return fail("Name and email are required");
    const status = settings.comment_moderation && !canManage(u) ? "pending" : "approved";
    const id = (await createComment({
        post_id: postId,
        user_id: u ? u.id : null,
        author_name,
        author_email,
        author_url: String(body.author_url || ""),
        content,
        status,
        parent_id: Number(body.parent || body.parent_id) || 0,
    }));
    return ok({ id, status }, 201);
}
