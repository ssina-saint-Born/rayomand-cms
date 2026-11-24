import { getDb, now, withTransaction } from "@/lib/db";
import { createPost } from "@/lib/posts";
import { createTerm, getTermBySlug } from "@/lib/terms";
import { createComment } from "@/lib/comments";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    return withTransaction(async () => {
        const { user, res } = (await auth("administrator"));
        if (res)
            return res;
        const body = await readBody(req);
        if (!body || !Array.isArray(body.posts))
            return fail("Invalid export file");
        const db = getDb();
        let importedPosts = 0;
        let importedTerms = 0;
        let importedComments = 0;
        const termIdMap: Record<number, number> = {};
        for (const t of body.terms || []) {
            const existing = (await getTermBySlug(t.taxonomy, t.slug));
            if (existing) {
                termIdMap[t.id] = existing.id;
            }
            else {
                termIdMap[t.id] = (await createTerm({
                    taxonomy: t.taxonomy,
                    name: t.name,
                    slug: t.slug,
                    description: t.description,
                }));
                importedTerms++;
            }
        }
        const postIdMap: Record<number, number> = {};
        for (const p of body.posts) {
            let content = [];
            try {
                content = JSON.parse(p.content || "[]");
            }
            catch {
                content = [];
            }
            const id = (await createPost({
                type: p.type === "page" ? "page" : "post",
                title: p.title,
                slug: p.slug,
                content,
                excerpt: p.excerpt,
                status: p.status === "trash" ? "draft" : p.status,
                comment_status: p.comment_status,
                sticky: p.sticky,
            }, user!.id));
            postIdMap[p.id] = id;
            importedPosts++;
        }
        for (const rel of body.relationships || []) {
            const pid = postIdMap[rel.post_id];
            const tid = termIdMap[rel.term_id];
            if (pid && tid)
                (await db.execute("INSERT INTO term_relationships (post_id,term_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", pid, tid));
        }
        for (const c of body.comments || []) {
            const pid = postIdMap[c.post_id];
            if (!pid)
                continue;
            (await createComment({
                post_id: pid,
                author_name: c.author_name,
                author_email: c.author_email,
                author_url: c.author_url,
                content: c.content,
                status: c.status === "approved" ? "approved" : "pending",
            }));
            importedComments++;
        }
        return ok({ importedPosts, importedTerms, importedComments });
    });
}
