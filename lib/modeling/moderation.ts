import { getDb, now, withTransaction } from "../db";
import { getContentType } from "./contentTypes";
import { getWorkflow, DcWorkflow, DcWorkflowState, DcWorkflowTransition } from "./workflows";
import { canPublish, canManage } from "../auth";
import type { User } from "../types";
import { EntityAdapter, adapterFor, adapterForTable, adapterForEntity } from "./entities";
import { entityTypeForTable, EntityTypeDef } from "./entityTypes";

// Generic content-moderation model (native content moderation),
// adapter-driven so it serves posts (revisionable), products (live-row
// transitions), and media (excluded — not publishable/revisionable).
//   - A bundle opts into a workflow via model_content_types.workflow_id.
//   - Revisionable types (posts/pages): editing creates a working revision with a
//     moderation_state; the live row stays published until a transition to a
//     published state promotes the working revision.
//   - Non-revisionable publishable types (products): transitions apply to the live
//     row directly (status + moderation_state column); no pending working revision.
//   - Transition availability is gated by the workflow definition and a minimum
//     role (native equivalent of per-transition permission
//     `use {workflow} transition {transition_id}`).

export interface ModerationView {
  entityTable: string;
  entityId: number;
  workflow: DcWorkflow;
  currentState: string;
  publishedState: boolean;
  validTransitions: Array<DcWorkflowTransition & { allowed: boolean }>;
  pendingRevisions: number;
  liveTitle: string;
  livePublishedAt: string | null;
}

function roleRank(role: string): number {
  const map: Record<string, number> = { contributor: 2, author: 3, editor: 4, administrator: 5 };
  return map[role] ?? 1;
}
function roleRankAtLeast(role: string, min: string): boolean {
  return roleRank(role) >= roleRank(min);
}

// Resolve the workflow for an entity's bundle. Returns null when the entity is
// not moderated (no bundle, no workflow, or non-moderateable entity type).
export async function getWorkflowForEntity(
  entityTable: string,
  entityId: number,
  contentTypeId: number | null,
): Promise<DcWorkflow | null> {
  const et = entityTypeForTable(entityTable);
  if (!et.moderateable) return null; // posts/products only
  if (contentTypeId == null) {
    const rec = await getDb().one("SELECT content_type_id FROM model_entity_bundles WHERE entity_table=$1 AND entity_id=$2", entityTable, entityId);
    contentTypeId = rec ? Number(rec.content_type_id) : null;
  }
  if (contentTypeId == null) return null;
  const ct = await getContentType(contentTypeId);
  if (!ct || ct.workflow_id == null) return null;
  return getWorkflow(ct.workflow_id);
}

// Current moderation state for an entity.
// Revisionable: the latest working revision's moderation_state (fall back to the
// workflow initial state). Non-revisionable publishable: the live-row
// moderation_state column (fall back to the workflow initial state).
async function currentState(adapter: EntityAdapter, et: EntityTypeDef, id: number, wf: DcWorkflow): Promise<string> {
  if (et.revisionable) {
    const row = await getDb().one("SELECT moderation_state FROM revisions WHERE post_id=$1 AND moderation_state IS NOT NULL ORDER BY id DESC LIMIT 1", id);
    return row ? String(row.moderation_state) : wf.initial_state;
  }
  const row = await getDb().one(`SELECT moderation_state FROM ${et.table} WHERE ${et.idKey}=$1`, id);
  return row && row.moderation_state ? String(row.moderation_state) : wf.initial_state;
}

export async function moderationView(
  entityTable: string,
  entityId: number,
  contentTypeId: number | null,
  user: User | null,
): Promise<ModerationView | null> {
  const wf = await getWorkflowForEntity(entityTable, entityId, contentTypeId);
  if (!wf) return null;
  const et = entityTypeForTable(entityTable);
  if (!et.moderateable) return null;
  const adapter = adapterFor(et);
  const db = getDb();
  const row = await db.one(`SELECT ${et.labelKey} AS label, ${et.publishedKey} AS published FROM ${et.table} WHERE ${et.idKey}=$1`, entityId);
  const state = await currentState(adapter, et, entityId, wf);
  const stateObj = wf.states.find((s) => s.state === state);
  const pendingRevisions = et.revisionable
    ? Number(((await db.one("SELECT COUNT(*) AS c FROM revisions WHERE post_id=$1 AND moderation_state IS NOT NULL", entityId)) as any).c || 0)
    : 0; // products have no pending revisions
  const publishedState = !!stateObj && !!stateObj.published;
  const transitions = wf.transitions
    .filter((t) => t.from_state === state)
    .sort((a, b) => a.weight - b.weight)
    .map((t) => ({
      ...t,
      allowed: !!user && roleRankAtLeast(user.role, t.min_role) && (publishedState || canManage(user) || t.to_state !== wf.initial_state),
    }));
  return {
    entityTable,
    entityId,
    workflow: wf,
    currentState: state,
    publishedState,
    validTransitions: transitions,
    pendingRevisions,
    liveTitle: row ? String(row.label || "") : "",
    livePublishedAt: null,
  };
}

export interface TransitionResult {
  applied: boolean;
  state: string;
  message?: string;
}

// Record a working revision under a moderation state (posts/pages only).
// Returns the new revision id; null for non-revisionable types.
export async function saveWorkingRevision(
  entityTable: string,
  entityId: number,
  data: { title?: string; content?: unknown; excerpt?: string; moderationState: string; authorId: number },
): Promise<number | null> {
  const et = entityTypeForTable(entityTable);
  const adapter = adapterFor(et);
  return adapter.snapshotWorkingRevision(entityId, data);
}

// Apply a transition. Revisionable: promote the working revision into the live
// row when the destination state is published. Non-revisionable (products):
// apply the state transition directly on the live row.
export async function applyTransition(
  entityTable: string,
  entityId: number,
  transitionId: number,
  user: User,
): Promise<TransitionResult> {
  return withTransaction(async () => {
    const db = getDb();
    const et = entityTypeForTable(entityTable);
    const adapter = adapterFor(et);
    if (!et.moderateable) throw new Error("This entity type cannot be moderated.");
    const tr = await db.one("SELECT * FROM model_workflow_transitions WHERE id=$1", transitionId) as DcWorkflowTransition | undefined;
    if (!tr) throw new Error("Transition not found.");
    const wf = await getWorkflow(tr.workflow_id);
    if (!wf) throw new Error("Workflow not found.");
    const current = await currentState(adapter, et, entityId, wf);
    if (tr.from_state !== current) throw new Error("This transition does not apply to the current state.");
    if (!roleRankAtLeast(user.role, tr.min_role)) throw new Error("You do not have permission to use this transition.");
    const toState = wf.states.find((s) => s.state === tr.to_state);
    if (!toState) throw new Error("Destination state not found.");
    const t = now();

    if (et.revisionable) {
      const revision = await db.one("SELECT * FROM revisions WHERE post_id=$1 ORDER BY id DESC LIMIT 1", entityId);
      if (!revision) throw new Error("No revision exists for this entity.");
      if (toState.published) {
        await db.execute(
          "UPDATE posts SET title=$1, content=$2, excerpt=$3, status='publish', updated_at=$4, published_at=COALESCE(published_at,$4) WHERE id=$5",
          String(revision.title ?? ""), revision.content ?? "[]", String(revision.excerpt ?? ""), t, entityId,
        );
      }
      else {
        await db.execute("UPDATE posts SET status='pending', updated_at=$1 WHERE id=$2", t, entityId);
      }
      await db.execute("UPDATE revisions SET moderation_state=$1 WHERE id=$2", tr.to_state, Number(revision.id));
    }
    else {
      // Live-row transition for publishable non-revisionable types (products).
      await db.execute(
        `UPDATE ${et.table} SET ${et.publishedKey}=$1, moderation_state=$2, updated_at=$3 WHERE ${et.idKey}=$4`,
        toState.published ? "publish" : "draft", tr.to_state, t, entityId,
      );
    }
    return { applied: true, state: tr.to_state };
  });
}

// Editor+ moderation inbox: list entities with pending working revisions
// (posts/pages) or rows in a non-published moderation state (products).
export async function pendingItems(): Promise<Array<{ entityTable: string; entityId: number; title: string; state: string; contentTypeId: number | null; }>> {
  const db = getDb();
  const out: Array<{ entityTable: string; entityId: number; title: string; state: string; contentTypeId: number | null; }> = [];
  // Revisionable types: pending working revisions (moderation_state present).
  const posts = await db.many(
    "SELECT DISTINCT r.post_id, p.title, r.moderation_state AS state FROM revisions r JOIN posts p ON p.id=r.post_id WHERE r.moderation_state IS NOT NULL ORDER BY r.post_id",
  );
  for (const r of posts) {
    const ct = await getDb().one("SELECT content_type_id FROM model_entity_bundles WHERE entity_table='posts' AND entity_id=$1", Number(r.post_id));
    out.push({ entityTable: "posts", entityId: Number(r.post_id), title: String(r.title), state: String(r.state), contentTypeId: ct ? Number(ct.content_type_id) : null });
  }
  // Publishable non-revisionable types: rows with a moderation_state that is not a published state.
  const products = await db.many("SELECT id, name AS title, moderation_state AS state FROM products WHERE moderation_state IS NOT NULL ORDER BY id");
  for (const r of products) {
    const ct = await getDb().one("SELECT content_type_id FROM model_entity_bundles WHERE entity_table='products' AND entity_id=$1", Number(r.id));
    out.push({ entityTable: "products", entityId: Number(r.id), title: String(r.title), state: String(r.state), contentTypeId: ct ? Number(ct.content_type_id) : null });
  }
  return out;
}

export { canPublish, canManage };
export type { EntityAdapter };
export { adapterFor, adapterForTable, adapterForEntity };