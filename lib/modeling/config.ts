import { getDb, now, withTransaction } from "../db";
import { getAllOptions, setOption } from "../options";
import { listContentTypes, getContentType } from "./contentTypes";
import { listFields } from "./fields";
import { listWorkflows } from "./workflows";
import { parseJson } from "../shop/core";

// Configuration export/import/compare (configuration API equivalent).
// Active config lives in the `options` table (existing). Snapshots capture the
// full config (options + bundles + fields + workflows + views) as a versioned
// JSON document. Compare produces a snapshot-comparer-style changelist;
// diff produces per-key diffs (config diff).

export interface SnapshotRecord {
  id: number;
  label: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Changelist {
  created: string[];
  updated: string[];
  deleted: string[];
}

async function loadActiveConfig(): Promise<Record<string, unknown>> {
  const options = await getAllOptions();
  const contentTypes = await listContentTypes();
  const bundles: Record<string, unknown> = {};
  for (const ct of contentTypes) {
    bundles[ct.machine_name] = { ...ct, fields: await listFields(ct.id) };
  }
  const workflows = await listWorkflows();
  return { options, bundles, workflows };
}

export async function exportSnapshot(label: string): Promise<SnapshotRecord> {
  const data = await loadActiveConfig();
  const r = await getDb().execute(
    "INSERT INTO model_config_snapshots (label,data,created_at) VALUES ($1,$2,$3) RETURNING id",
    label, JSON.stringify(data), now(),
  );
  return (await getSnapshot(Number(r.id)))!;
}

export async function getSnapshot(id: number): Promise<SnapshotRecord | null> {
  const row = await getDb().one("SELECT * FROM model_config_snapshots WHERE id=$1", id);
  if (!row) return null;
  return {
    id: Number(row.id),
    label: String(row.label),
    data: parseJson(row.data, {}),
    created_at: String(row.created_at),
  };
}

export async function listSnapshots(): Promise<Array<{ id: number; label: string; created_at: string }>> {
  const rows = await getDb().many("SELECT id, label, created_at FROM model_config_snapshots ORDER BY id DESC");
  return rows.map((r) => ({ id: Number(r.id), label: String(r.label), created_at: String(r.created_at) }));
}

export async function deleteSnapshot(id: number): Promise<void> {
  await getDb().execute("DELETE FROM model_config_snapshots WHERE id=$1", id);
}

// snapshot-comparer-style changelist between the current active config and
// a snapshot. Keys are top-level sections (options/bundles/workflows).
function compareSections(active: Record<string, unknown>, snap: Record<string, unknown>): Changelist {
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const keys = Array.from(new Set([...Object.keys(active), ...Object.keys(snap)]));
  for (const key of keys) {
    if (!(key in snap)) deleted.push(key);
    else if (!(key in active)) created.push(key);
    else if (JSON.stringify(active[key]) !== JSON.stringify(snap[key])) updated.push(key);
  }
  return { created, updated, deleted };
}

export function compareSnapshot(id: number): Promise<{ current: Changelist; snapshot: Changelist }> {
  return (async () => {
    const snap = await getSnapshot(id);
    if (!snap) throw new Error("Snapshot not found.");
    const active = await loadActiveConfig();
    return {
      current: compareSections(active, snap.data),
      snapshot: compareSections(snap.data, active),
    };
  })();
}

// Import the options section of a snapshot into active config. Bundles and
// workflows are imported by reference only if they exist; full CRUD-level import
// is intentionally scoped to options for safety in this version.
export async function importSnapshot(id: number): Promise<{ applied: { created: string[]; updated: string[]; deleted: string[] } }> {
  return withTransaction(async () => {
    const snap = await getSnapshot(id);
    if (!snap) throw new Error("Snapshot not found.");
    const activeOptions = await getAllOptions();
    const snapOptions = (snap.data.options || {}) as Record<string, string>;
    const created: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];
    for (const [name, value] of Object.entries(snapOptions)) {
      if (name in activeOptions) updated.push(name);
      else created.push(name);
      await setOption(name, value);
    }
    return { applied: { created, updated, deleted } };
  });
}

export { parseJson };