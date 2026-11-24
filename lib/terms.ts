import { getDb, withTransaction } from "./db";
import { slugify } from "./format";
import type { Term } from "./types";
async function withCount(t: Term): Promise<Term> {
    const c = ((await getDb().one("SELECT COUNT(*) AS c FROM term_relationships tr JOIN posts p ON p.id=tr.post_id WHERE tr.term_id=$1 AND p.status='publish'", t.id)) as {
        c: number;
    }).c;
    return { ...t, count: c };
}
export async function listTerms(taxonomy: "category" | "tag"): Promise<Term[]> {
    const rows = (await getDb().many("SELECT * FROM terms WHERE taxonomy=$1 ORDER BY name ASC", taxonomy)) as Term[];
    return (await Promise.all(rows.map(withCount)));
}
export async function getTerm(id: number): Promise<Term | null> {
    const r = (await getDb().one("SELECT * FROM terms WHERE id=$1", id)) as Term | undefined;
    return r ? (await withCount(r)) : null;
}
export async function getTermBySlug(taxonomy: string, slug: string): Promise<Term | null> {
    const r = (await getDb().one("SELECT * FROM terms WHERE taxonomy=$1 AND slug=$2", taxonomy, slug)) as Term | undefined;
    return r ? (await withCount(r)) : null;
}
export async function createTerm(data: {
    taxonomy: "category" | "tag";
    name: string;
    slug?: string;
    description?: string;
    parent_id?: number;
}): Promise<number> {
    const db = getDb();
    let slug = data.slug?.trim() ? slugify(data.slug) : slugify(data.name);
    const exists = (await db.one("SELECT id FROM terms WHERE taxonomy=$1 AND slug=$2", data.taxonomy, slug));
    if (exists)
        slug = `${slug}-${Date.now().toString().slice(-4)}`;
    const r = (await db.execute("INSERT INTO terms (taxonomy,name,slug,description,parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", data.taxonomy, data.name, slug, data.description || "", data.parent_id || 0));
    return Number(r.id);
}
export async function updateTerm(id: number, data: Partial<{
    name: string;
    slug: string;
    description: string;
    parent_id: number;
}>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined)
            continue;
        fields.push(`${k}=$${values.length + 1}`);
        values.push(k === "slug" ? slugify(String(v)) : v);
    }
    if (!fields.length)
        return;
    values.push(id);
    (await getDb().execute(`UPDATE terms SET ${fields.join(",")} WHERE id=$${values.length}`, ...values));
}
export async function deleteTerm(id: number): Promise<void> {
    return withTransaction(async () => {
        const db = getDb();
        (await db.execute("DELETE FROM terms WHERE id=$1", id));
        (await db.execute("DELETE FROM term_relationships WHERE term_id=$1", id));
    });
}
