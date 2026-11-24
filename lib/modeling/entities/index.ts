import { getDb, now } from "../../db";
import { entityTypeDef, EntityTypeDef, entityTypeForTable } from "../entityTypes";
import { getPost } from "../../posts";
import { getContentType } from "../contentTypes";

// Adapter interface: the generic field/moderation/views engine talks to this,
// so it stays entity-type-agnostic across posts/products/media.
export interface EntityAdapter {
  entityType: EntityTypeDef;
  entityExists(id: number): Promise<boolean>;
  getRow(id: number): Promise<Record<string, any> | null>;
  label(id: number): Promise<string>;
  isPublished(row: Record<string, any>): boolean;
  setPublished(id: number, published: boolean): Promise<void>;
  // Posts only: snapshot a working revision; returns null for non-revisionable.
  snapshotWorkingRevision(id: number, opts: { title?: string; content?: unknown; excerpt?: string; moderationState: string; authorId: number }): Promise<number | null>;
  // Posts only: promote a working revision into the live row. No-op for others.
  promoteRevision(id: number, revisionId: number, toState: string): Promise<void>;
}

export function adapterFor(entityType: EntityTypeDef): EntityAdapter {
  switch (entityType.id) {
    case "post":
    case "page":
      return postAdapter(entityType);
    case "product":
      return productAdapter;
    case "media":
      return mediaAdapter;
    default:
      throw new Error("This entity type has no adapter.");
  }
}

export function adapterForTable(table: string): EntityAdapter {
  return adapterFor(entityTypeForTable(table));
}

// --- Posts / Pages (revisionable + publishable) ---
function postAdapter(et: EntityTypeDef): EntityAdapter {
  return {
    entityType: et,
    async entityExists(id) {
      return !!(await getDb().one("SELECT id FROM posts WHERE id=$1", id));
    },
    async getRow(id) {
      const p = await getPost(id);
      return p ? (p as unknown as Record<string, any>) : null;
    },
    async label(id) {
      const p = await getPost(id);
      return p ? String(p.title || "untitled") : "";
    },
    isPublished(row) {
      return String(row?.status) === "publish" || String(row?.status) === "private";
    },
    async setPublished(id, published) {
      await getDb().execute("UPDATE posts SET status=$1, updated_at=$2 WHERE id=$3", published ? "publish" : "pending", now(), id);
    },
    async snapshotWorkingRevision(id, opts) {
      const existing = await getDb().one("SELECT title, content, excerpt, author_id FROM posts WHERE id=$1", id);
      const r = await getDb().execute(
        "INSERT INTO revisions (post_id,title,content,author_id,created_at,moderation_state) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        id,
        opts.title !== undefined ? opts.title : existing.title,
        opts.content !== undefined ? JSON.stringify(opts.content) : existing.content,
        opts.authorId || existing.author_id,
        now(),
        opts.moderationState,
      );
      return Number(r.id);
    },
    async promoteRevision(id, revisionId, toState) {
      const revision = await getDb().one("SELECT * FROM revisions WHERE id=$1", revisionId);
      if (!revision) return;
      const t = now();
      await getDb().execute(
        "UPDATE posts SET title=$1, content=$2, excerpt=$3, status='publish', updated_at=$4, published_at=COALESCE(published_at,$4) WHERE id=$5",
        String(revision.title ?? ""), revision.content ?? "[]", String(revision.excerpt ?? ""), t, id,
      );
      await getDb().execute("UPDATE revisions SET moderation_state=$1 WHERE id=$2", toState, Number(revision.id));
    },
  };
}

// --- Products (publishable, NOT revisionable → live-row transitions only) ---
const productAdapter: EntityAdapter = {
  entityType: entityTypeDef("product"),
  async entityExists(id) {
    return !!(await getDb().one("SELECT id FROM products WHERE id=$1", id));
  },
  async getRow(id) {
    return (await getDb().one("SELECT * FROM products WHERE id=$1", id)) || null;
  },
  async label(id) {
    const p = await getDb().one("SELECT name FROM products WHERE id=$1", id);
    return p ? String(p.name || "untitled") : "";
  },
  isPublished(row) {
    return String(row?.status) === "publish";
  },
  async setPublished(id, published) {
    await getDb().execute("UPDATE products SET status=$1, updated_at=$2 WHERE id=$3", published ? "publish" : "draft", now(), id);
  },
  async snapshotWorkingRevision() {
    return null;
  },
  async promoteRevision() {
    // no-op: products have no revisions
  },
};

// --- Media (NOT publishable, NOT revisionable → no moderation) ---
const mediaAdapter: EntityAdapter = {
  entityType: entityTypeDef("media"),
  async entityExists(id) {
    return !!(await getDb().one("SELECT id FROM media WHERE id=$1", id));
  },
  async getRow(id) {
    return (await getDb().one("SELECT * FROM media WHERE id=$1", id)) || null;
  },
  async label(id) {
    const m = await getDb().one("SELECT title, filename FROM media WHERE id=$1", id);
    return m ? String(m.title || m.filename || "untitled") : "";
  },
  isPublished() {
    return true; // media has no publishable state; always visible
  },
  async setPublished() {
    // no-op: media is not publishable
  },
  async snapshotWorkingRevision() {
    return null;
  },
  async promoteRevision() {
    // no-op
  },
};

// Resolve the adapter for an entity (by table + id) through its bundle.
export async function adapterForEntity(table: string, id: number): Promise<EntityAdapter | null> {
  const bundle = await getDb().one("SELECT content_type_id FROM model_entity_bundles WHERE entity_table=$1 AND entity_id=$2", table, id);
  if (bundle) {
    const ct = await getContentType(Number(bundle.content_type_id));
    if (ct) return adapterFor(entityTypeForTable(table));
  }
  return null;
}