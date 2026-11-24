import { ok, fail, readBody, auth } from "@/lib/api";
import { listComments, setCommentStatus } from "@/lib/comments";
import { emitNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comment moderation queue for the mobile app. Listing needs editor rights;
// approving/spamming/deleting is the same setCommentStatus used by the web UI.
export async function GET(req: Request) {
    const { res } = await auth("editor");
    if (res)
        return res;
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const result = await listComments({
        status,
        postId: Number(url.searchParams.get("post_id") || 0) || undefined,
        page: Number(url.searchParams.get("page") || 1),
        perPage: Math.min(Number(url.searchParams.get("per_page") || 20), 50),
    });
    return ok({ items: result.items, total: result.total });
}

export async function POST(req: Request) {
    const { user, res } = await auth("editor");
    if (res)
        return res;
    const body = await readBody(req);
    const id = Number(body.id || 0);
    const action = String(body.action || "");
    if (!id || !["approve", "spam", "trash", "delete"].includes(action))
        return fail("Send an id and an action (approve, spam, trash, delete).");
    const status = action === "approve" ? "approved" : action === "spam" ? "spam" : "trash";
    await setCommentStatus(id, status);
    await emitNotification({
        userId: user!.id,
        kind: "comment",
        level: "info",
        title: `Comment #${id} ${status}`,
        body: `Moderated from the mobile app.`,
        url: `/studio/comments`,
        dedupeKey: `comment:${id}:${status}`,
    });
    return ok({ id, status });
}
