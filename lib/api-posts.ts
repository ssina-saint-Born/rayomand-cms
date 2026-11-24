import { listPosts, getPost, createPost, updatePost, trashPost, deletePost, restorePost, } from "./posts";
import { currentUser, canEdit, canPublish, canManage } from "./auth";
import { ok, fail, readBody, auth, num } from "./api";
import { getPostMeta, setMetaBatch } from "./postmeta";
import type { PostType } from "./types";

// Per-post SEO/social overrides persisted in `postmeta`.
const SEO_META_KEYS = ["seo_title", "seo_description", "seo_canonical", "seo_image", "seo_noindex"];

function pickSeoMeta(body: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of SEO_META_KEYS) {
        if (body[k] !== undefined) out[k] = String(body[k] ?? "");
    }
    return out;
}

export async function handleList(req: Request, type: PostType): Promise<Response> {
    const url = new URL(req.url);
    const u = (await currentUser());
    const status = canEdit(u)
        ? (url.searchParams.get("status") as any) || "any"
        : "publish";
    const page = num(url.searchParams.get("page")) || 1;
    const perPage = num(url.searchParams.get("per_page")) || 10;
    const { items, total } = (await listPosts({
        type,
        status,
        search: url.searchParams.get("search") || undefined,
        category: num(url.searchParams.get("category")),
        tag: num(url.searchParams.get("tag")),
        author: num(url.searchParams.get("author")),
        page,
        perPage,
    }));
    return ok({
        items,
        total,
        page,
        perPage,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
}
export async function handleCreate(req: Request, type: PostType): Promise<Response> {
    const { user, res } = (await auth("contributor"));
    if (res)
        return res;
    const body = await readBody(req);
    let status = body.status || "draft";
    if ((status === "publish" || status === "private" || status === "future") && !canPublish(user!))
        status = "pending";
    const authorId = body.author_id && canManage(user!) ? Number(body.author_id) : user!.id;
    const id = (await createPost({ ...body, type, status }, authorId));
    const meta = pickSeoMeta(body);
    if (Object.keys(meta).length)
        await setMetaBatch(id, meta);
    return ok(await withMeta(await getPost(id)), 201);
}
export async function handleGet(id: number): Promise<Response> {
    const post = (await getPost(id));
    if (!post)
        return fail("Not found", 404);
    const u = (await currentUser());
    if (post.status !== "publish" && !canEdit(u))
        return fail("Not found", 404);
    return ok(await withMeta(post));
}
export async function handlePatch(id: number, req: Request): Promise<Response> {
    const { user, res } = (await auth("contributor"));
    if (res)
        return res;
    const post = (await getPost(id));
    if (!post)
        return fail("Not found", 404);
    if (!canManage(user!) && post.author_id !== user!.id)
        return fail("Forbidden", 403);
    const body = await readBody(req);
    if ((body.status === "publish" || body.status === "private" || body.status === "future") &&
        !canPublish(user!))
        body.status = "pending";
    (await updatePost(id, body));
    const meta = pickSeoMeta(body);
    if (Object.keys(meta).length)
        await setMetaBatch(id, meta);
    return ok(await withMeta(await getPost(id)));
}
export async function handleDelete(id: number, req: Request): Promise<Response> {
    const { user, res } = (await auth("contributor"));
    if (res)
        return res;
    const post = (await getPost(id));
    if (!post)
        return fail("Not found", 404);
    if (!canManage(user!) && post.author_id !== user!.id)
        return fail("Forbidden", 403);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    if (action === "restore") {
        (await restorePost(id));
        return ok((await getPost(id)));
    }
    const force = url.searchParams.get("force") === "1";
    if (force) {
        if (!canManage(user!))
            return fail("Forbidden", 403);
        (await deletePost(id));
        return ok({ deleted: true, id });
    }
    (await trashPost(id));
    return ok((await getPost(id)));
}

// Attach SEO meta to a post payload so the editor can hydrate its panel.
async function withMeta(post: any): Promise<any> {
    if (!post) return post;
    const meta = await getPostMeta(post.id);
    const seo: Record<string, string> = {};
    for (const k of SEO_META_KEYS) seo[k] = meta[k] || "";
    return { ...post, seo };
}
