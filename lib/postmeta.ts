import { getDb } from "./db";

// Thin accessor over the existing `postmeta` key/value table. Used for
// per-entity SEO overrides (title, description, canonical, social image,
// indexing) without altering the posts schema.
export async function getPostMeta(postId: number): Promise<Record<string, string>> {
  const rows = (await getDb().many("SELECT key, value FROM postmeta WHERE post_id=$1", postId)) as {
    key: string;
    value: string | null;
  }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value == null ? "" : String(r.value);
  return out;
}

export async function getMetaValue(postId: number, key: string): Promise<string> {
  const row = (await getDb().one("SELECT value FROM postmeta WHERE post_id=$1 AND key=$2 ORDER BY id DESC LIMIT 1", postId, key)) as
    | { value: string | null }
    | undefined;
  return row && row.value != null ? String(row.value) : "";
}

// Upsert a single key. Empty values delete the row so defaults apply again.
export async function setMetaValue(postId: number, key: string, value: string): Promise<void> {
  const db = getDb();
  const v = (value ?? "").toString();
  if (!v.trim()) {
    await db.execute("DELETE FROM postmeta WHERE post_id=$1 AND key=$2", postId, key);
    return;
  }
  const existing = (await db.one("SELECT id FROM postmeta WHERE post_id=$1 AND key=$2 LIMIT 1", postId, key)) as
    | { id: number }
    | undefined;
  if (existing) {
    await db.execute("UPDATE postmeta SET value=$1 WHERE id=$2", v, existing.id);
  } else {
    await db.execute("INSERT INTO postmeta (post_id,key,value) VALUES ($1,$2,$3)", postId, key, v);
  }
}

// Replace a set of meta keys atomically-ish (delete removed, upsert provided).
export async function setMetaBatch(postId: number, data: Record<string, string | undefined>): Promise<void> {
  for (const [key, value] of Object.entries(data)) {
    await setMetaValue(postId, key, value ?? "");
  }
}

export async function deletePostMeta(postId: number): Promise<void> {
  await getDb().execute("DELETE FROM postmeta WHERE post_id=$1", postId);
}
