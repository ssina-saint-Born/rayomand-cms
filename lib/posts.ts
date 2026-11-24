import { getDb, now, withTransaction } from "./db";
import { slugify } from "./format";
import type { Block, Post, PostStatus, PostType, Term } from "./types";
function parseBlocks(raw: string): Block[] {
    try {
        const v = JSON.parse(raw || "[]");
        return Array.isArray(v) ? v : [];
    }
    catch {
        return [];
    }
}
function base(row: any): Post {
    return {
        ...row,
        content: parseBlocks(row.content),
        sticky: Number(row.sticky),
        parent_id: Number(row.parent_id),
        menu_order: Number(row.menu_order),
        featured_media_id: row.featured_media_id ?? null,
    } as Post;
}
export async function hydrate(post: Post): Promise<Post> {
    const db = getDb();
    post.author =
        ((await db.one("SELECT id,username,email,display_name,role,bio,created_at FROM users WHERE id=$1", post.author_id)) as any) || undefined;
    const terms = (await db.many("SELECT t.* FROM terms t JOIN term_relationships tr ON tr.term_id=t.id WHERE tr.post_id=$1", post.id)) as Term[];
    post.categories = terms.filter((t) => t.taxonomy === "category");
    post.tags = terms.filter((t) => t.taxonomy === "tag");
    post.comment_count = ((await db.one("SELECT COUNT(*) AS c FROM comments WHERE post_id=$1 AND status='approved'", post.id)) as {
        c: number;
    }).c;
    if (post.featured_media_id) {
        const m = (await db.one("SELECT * FROM media WHERE id=$1", post.featured_media_id)) as any;
        post.featured_media = m ? { ...m, url: `/uploads/${m.stored_name}` } : null;
    }
    else {
        post.featured_media = null;
    }
    return post;
}

// Promote scheduled posts whose publish date has arrived. Called lazily on
// public reads so no external cron is required.
export async function publishDueScheduled(): Promise<void> {
    await getDb().execute(
        "UPDATE posts SET status='publish', updated_at=$1 WHERE status='future' AND published_at IS NOT NULL AND published_at <= $1",
        now(),
    );
}

export async function getPost(id: number): Promise<Post | null> {
    const row = (await getDb().one("SELECT * FROM posts WHERE id=$1", id));
    return row ? (await hydrate(base(row))) : null;
}
export async function getPostBySlug(slug: string, type: PostType): Promise<Post | null> {
    await publishDueScheduled();
    const row = (await getDb().one("SELECT * FROM posts WHERE slug=$1 AND type=$2", slug, type));
    return row ? (await hydrate(base(row))) : null;
}

// Old slug -> post id, so a renamed permalink can 301 to its new location.
export async function findSlugRedirect(slug: string): Promise<{ id: number; type: PostType; slug: string } | null> {
    const row = (await getDb().one(
        "SELECT h.post_id, p.type, p.slug FROM post_slug_history h JOIN posts p ON p.id=h.post_id WHERE h.slug=$1 AND p.status IN ('publish','private') ORDER BY h.id DESC LIMIT 1",
        slug,
    )) as any;
    return row ? { id: Number(row.post_id), type: row.type as PostType, slug: String(row.slug) } : null;
}

export interface ListQuery {
    type?: PostType;
    status?: PostStatus | "any" | "trash";
    author?: number;
    category?: number;
    tag?: number;
    search?: string;
    page?: number;
    perPage?: number;
    sticky?: boolean;
    parent?: number;
}
export async function listPosts(q: ListQuery): Promise<{
    items: Post[];
    total: number;
}> {
    await publishDueScheduled();
    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];
    if (q.type) {
        where.push(`p.type=$${params.length + 1}`);
        params.push(q.type);
    }
    if (q.status && q.status !== "any") {
        where.push(`p.status=$${params.length + 1}`);
        params.push(q.status);
    }
    else if (!q.status) {
        where.push("p.status != 'trash'");
    }
    if (q.author) {
        where.push(`p.author_id=$${params.length + 1}`);
        params.push(q.author);
    }
    if (q.parent !== undefined) {
        where.push(`p.parent_id=$${params.length + 1}`);
        params.push(q.parent);
    }
    if (q.search) {
        where.push(`(p.title LIKE $${params.length + 1} OR p.content LIKE $${params.length + 2} OR p.excerpt LIKE $${params.length + 3})`);
        const s = `%${q.search}%`;
        params.push(s, s, s);
    }
    if (q.category) {
        where.push(`p.id IN (SELECT tr.post_id FROM term_relationships tr JOIN terms t ON t.id=tr.term_id WHERE t.id=$${params.length + 1} AND t.taxonomy='category')`);
        params.push(q.category);
    }
    if (q.tag) {
        where.push(`p.id IN (SELECT tr.post_id FROM term_relationships tr JOIN terms t ON t.id=tr.term_id WHERE t.id=$${params.length + 1} AND t.taxonomy='tag')`);
        params.push(q.tag);
    }
    if (q.sticky) {
        where.push("p.sticky=1");
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = ((await db.one(`SELECT COUNT(*) AS c FROM posts p ${whereSql}`, ...params)) as {
        c: number;
    }).c;
    const perPage = q.perPage ?? 10;
    const page = Math.max(1, q.page ?? 1);
    const offset = (page - 1) * perPage;
    const rows = (await db.many(`SELECT p.* FROM posts p ${whereSql} ORDER BY p.sticky DESC, p.published_at DESC, p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, ...params, perPage, offset));
    return { items: (await Promise.all(rows.map(async (r) => (await hydrate(base(r)))))), total };
}

// Slugs are unique across BOTH post and page types because /read/{slug}
// resolves either. Checking one type would let a page shadow a post.
export async function uniqueSlug(title: string, _type: PostType, excludeId?: number): Promise<string> {
    const db = getDb();
    let baseSlug = slugify(title);
    let slug = baseSlug;
    let i = 2;
    while (true) {
        const row = (await db.one("SELECT id FROM posts WHERE slug=$1", slug)) as {
            id: number;
        } | undefined;
        if (!row || row.id === excludeId)
            return slug;
        slug = `${baseSlug}-${i++}`;
    }
}

async function recordSlugHistory(postId: number, oldSlug: string, newSlug: string): Promise<void> {
    if (!oldSlug || oldSlug === newSlug)
        return;
    await getDb().execute(
        "INSERT INTO post_slug_history (post_id,slug,created_at) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET post_id=EXCLUDED.post_id, created_at=EXCLUDED.created_at",
        postId, oldSlug, now(),
    );
}

export interface PostInput {
    title: string;
    slug?: string;
    content: Block[];
    excerpt?: string;
    status?: PostStatus;
    type?: PostType;
    parent_id?: number;
    featured_media_id?: number | null;
    comment_status?: "open" | "closed";
    sticky?: number;
    format?: string;
    menu_order?: number;
    category_ids?: number[];
    tag_ids?: number[];
    scheduled_at?: string | null;
}

function normalizeSchedule(status: PostStatus, scheduledAt: string | null, fallback: string | null): { status: PostStatus; published_at: string | null } {
    if (status === "future") {
        const when = scheduledAt || fallback;
        if (!when)
            return { status: "draft", published_at: null };
        if (new Date(when).getTime() <= Date.now())
            return { status: "publish", published_at: when };
        return { status: "future", published_at: when };
    }
    return { status, published_at: null };
}

export async function createPost(input: PostInput, authorId: number): Promise<number> {
    return withTransaction(async () => {
        const db = getDb();
        const t = now();
        const type = input.type || "post";
        let status = (input.status || "draft") as PostStatus;
        const slug = input.slug?.trim()
            ? await uniqueSlug(input.slug, type)
            : (await uniqueSlug(input.title || "untitled", type));
        const sched = normalizeSchedule(status, input.scheduled_at || null, null);
        status = sched.status;
        const published = status === "publish" || status === "private"
            ? (sched.published_at || t)
            : (status === "future" ? sched.published_at : null);
        const r = (await db.execute("INSERT INTO posts (type,title,slug,content,excerpt,status,author_id,parent_id,featured_media_id,comment_status,sticky,format,menu_order,created_at,updated_at,published_at)\n       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id", type, input.title || "", slug, JSON.stringify(input.content || []), input.excerpt || "", status, authorId, input.parent_id || 0, input.featured_media_id ?? null, input.comment_status || "open", input.sticky ? 1 : 0, input.format || "standard", input.menu_order || 0, t, t, published));
        const id = Number(r.id);
        (await saveTerms(id, input.category_ids, input.tag_ids));
        return id;
    });
}
export async function updatePost(id: number, input: Partial<PostInput>): Promise<void> {
    return withTransaction(async () => {
        const db = getDb();
        const existing = (await db.one("SELECT * FROM posts WHERE id=$1", id)) as any;
        if (!existing)
            return;
        const t = now();
        const type = (input.type || existing.type) as PostType;
        let status = (input.status || existing.status) as PostStatus;
        let slug = existing.slug;
        // Only an explicit slug change moves a permalink; editing the title
        // leaves the live URL stable so existing links and rankings survive.
        if (input.slug !== undefined && input.slug.trim()) {
            const desired = slugify(input.slug);
            slug = desired === existing.slug ? existing.slug : await uniqueSlug(desired, type, id);
        }
        // Preserve the original publish date across later edits so permalinks,
        // feeds and article schema keep a stable datePublished.
        const sched = normalizeSchedule(status, input.scheduled_at ?? null, existing.published_at);
        status = sched.status;
        let published = existing.published_at;
        if (status === "publish" || status === "private")
            published = existing.published_at || sched.published_at || t;
        else if (status === "future")
            published = sched.published_at || existing.published_at;
        // draft/pending/trash keep whatever published_at they had (no wipe).
        (await db.execute("UPDATE posts SET title=$1, slug=$2, content=$3, excerpt=$4, status=$5, type=$6, parent_id=$7, featured_media_id=$8, comment_status=$9, sticky=$10, format=$11, menu_order=$12, updated_at=$13, published_at=$14 WHERE id=$15", input.title !== undefined ? input.title : existing.title, slug, input.content !== undefined ? JSON.stringify(input.content) : existing.content, input.excerpt !== undefined ? input.excerpt : existing.excerpt, status, type, input.parent_id !== undefined ? input.parent_id : existing.parent_id, input.featured_media_id !== undefined
            ? input.featured_media_id
            : existing.featured_media_id, input.comment_status || existing.comment_status, input.sticky !== undefined ? (input.sticky ? 1 : 0) : existing.sticky, input.format || existing.format, input.menu_order !== undefined ? input.menu_order : existing.menu_order, t, published, id));
        if (slug !== existing.slug)
            await recordSlugHistory(id, existing.slug, slug);
        if (input.category_ids || input.tag_ids)
            (await saveTerms(id, input.category_ids, input.tag_ids));
        // revision snapshot
        (await db.execute("INSERT INTO revisions (post_id,title,content,author_id,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id", id, input.title !== undefined ? input.title : existing.title, input.content !== undefined ? JSON.stringify(input.content) : existing.content, existing.author_id, t));
    });
}
export async function saveTerms(postId: number, categoryIds?: number[], tagIds?: number[]): Promise<void> {
    return withTransaction(async () => {
        const db = getDb();
        if (categoryIds) {
            const cats = (await db.many("SELECT tr.term_id FROM term_relationships tr JOIN terms t ON t.id=tr.term_id WHERE tr.post_id=$1 AND t.taxonomy='category'", postId)) as {
                term_id: number;
            }[];
            for (const c of cats)
                (await db.execute("DELETE FROM term_relationships WHERE post_id=$1 AND term_id=$2", postId, c.term_id));
            for (const id of categoryIds)
                (await db.execute("INSERT INTO term_relationships (post_id,term_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", postId, id));
        }
        if (tagIds) {
            const tags = (await db.many("SELECT tr.term_id FROM term_relationships tr JOIN terms t ON t.id=tr.term_id WHERE tr.post_id=$1 AND t.taxonomy='tag'", postId)) as {
                term_id: number;
            }[];
            for (const c of tags)
                (await db.execute("DELETE FROM term_relationships WHERE post_id=$1 AND term_id=$2", postId, c.term_id));
            for (const id of tagIds)
                (await db.execute("INSERT INTO term_relationships (post_id,term_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", postId, id));
        }
    });
}
export async function trashPost(id: number): Promise<void> {
    (await getDb().execute("UPDATE posts SET status='trash', updated_at=$1 WHERE id=$2", now(), id));
}
export async function restorePost(id: number): Promise<void> {
    (await getDb().execute("UPDATE posts SET status='draft', updated_at=$1 WHERE id=$2", now(), id));
}
export async function deletePost(id: number): Promise<void> {
    return withTransaction(async () => {
        const db = getDb();
        (await db.execute("DELETE FROM posts WHERE id=$1", id));
        (await db.execute("DELETE FROM term_relationships WHERE post_id=$1", id));
        (await db.execute("DELETE FROM comments WHERE post_id=$1", id));
        (await db.execute("DELETE FROM revisions WHERE post_id=$1", id));
        (await db.execute("DELETE FROM postmeta WHERE post_id=$1", id));
        (await db.execute("DELETE FROM post_slug_history WHERE post_id=$1", id));
    });
}
export async function countByStatus(type: PostType): Promise<Record<string, number>> {
    const rows = (await getDb().many("SELECT status, COUNT(*) AS c FROM posts WHERE type=$1 GROUP BY status", type)) as {
        status: string;
        c: number;
    }[];
    const out: Record<string, number> = {};
    for (const r of rows)
        out[r.status] = r.c;
    return out;
}
export async function getRevisions(postId: number) {
    return (await getDb().many("SELECT * FROM revisions WHERE post_id=$1 ORDER BY id DESC LIMIT 20", postId)) as any[];
}
export async function adjacentPosts(post: Post): Promise<{
    prev: Post | null;
    next: Post | null;
}> {
    const db = getDb();
    const prevRow = (await db.one("SELECT * FROM posts WHERE type='post' AND status='publish' AND published_at < $1 ORDER BY published_at DESC LIMIT 1", post.published_at));
    const nextRow = (await db.one("SELECT * FROM posts WHERE type='post' AND status='publish' AND published_at > $1 ORDER BY published_at ASC LIMIT 1", post.published_at));
    return {
        prev: prevRow ? (await hydrate(base(prevRow))) : null,
        next: nextRow ? (await hydrate(base(nextRow))) : null,
    };
}
