import { getDb, now, withTransaction } from "../db";
import { parseJson } from "../shop/core";
import { isKnownEntityType } from "./entityTypes";

export interface DcContentType {
  id: number;
  machine_name: string;
  label: string;
  description: string;
  base_type: "post" | "page" | "custom";
  entity_type: string;
  workflow_id: number | null;
  position: number;
  created_at: string;
}

function hydrate(row: any): DcContentType {
  return {
    ...row,
    workflow_id: row.workflow_id == null ? null : Number(row.workflow_id),
    position: Number(row.position),
    entity_type: row.entity_type || "custom",
  };
}

export async function listContentTypes(): Promise<DcContentType[]> {
  const rows = await getDb().many("SELECT * FROM model_content_types ORDER BY position, id");
  return rows.map(hydrate);
}

export async function getContentType(id: number): Promise<DcContentType | null> {
  const row = await getDb().one("SELECT * FROM model_content_types WHERE id=$1", id);
  return row ? hydrate(row) : null;
}

export async function getContentTypeByMachine(name: string): Promise<DcContentType | null> {
  const row = await getDb().one("SELECT * FROM model_content_types WHERE machine_name=$1", name);
  return row ? hydrate(row) : null;
}

export function assertMachineName(name: string): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return "Use lowercase letters, numbers and underscores.";
  if (name.length > 64) return "The machine name is too long.";
  return null;
}

const BASE_TYPES = new Set(["post", "page", "custom"]);

export async function createContentType(input: Record<string, any>): Promise<DcContentType> {
  return withTransaction(async () => {
    const db = getDb();
    const machine = String(input.machine_name || "").trim();
    const err = assertMachineName(machine);
    if (err) throw new Error(err);
    if (!input.label) throw new Error("A label is required.");
    const base = BASE_TYPES.has(input.base_type) ? input.base_type : "custom";
    const entityType = isKnownEntityType(input.entity_type) ? String(input.entity_type) : "custom";
    const position = Number(input.position ?? 0);
    const r = await db.execute(
      "INSERT INTO model_content_types (machine_name,label,description,base_type,entity_type,workflow_id,position,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      machine, String(input.label).trim(), String(input.description || ""), base, entityType,
      input.workflow_id ? Number(input.workflow_id) : null, position, now(),
    );
    return (await getContentType(Number(r.id)))!;
  });
}

export async function updateContentType(id: number, input: Record<string, any>): Promise<DcContentType> {
  return withTransaction(async () => {
    const db = getDb();
    const existing = await getContentType(id);
    if (!existing) throw new Error("Content type not found.");
    if (input.machine_name !== undefined && input.machine_name !== existing.machine_name) {
      const err = assertMachineName(String(input.machine_name));
      if (err) throw new Error(err);
    }
    if (input.workflow_id !== undefined && input.workflow_id != null && Number(input.workflow_id) !== 0) {
      const wf = await getDb().one("SELECT id FROM model_workflows WHERE id=$1", Number(input.workflow_id));
      if (!wf) throw new Error("Workflow not found.");
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col}=$${vals.length + 1}`); vals.push(v); };
    if (input.label !== undefined) push("label", String(input.label).trim());
    if (input.description !== undefined) push("description", String(input.description));
    if (input.machine_name !== undefined) push("machine_name", String(input.machine_name).trim());
    if (input.base_type !== undefined) push("base_type", BASE_TYPES.has(input.base_type) ? input.base_type : existing.base_type);
    if (input.entity_type !== undefined) push("entity_type", isKnownEntityType(input.entity_type) ? String(input.entity_type) : existing.entity_type);
    if (input.workflow_id !== undefined) {
      const wid = input.workflow_id == null || Number(input.workflow_id) === 0 ? null : Number(input.workflow_id);
      push("workflow_id", wid);
    }
    if (input.position !== undefined) push("position", Number(input.position));
    if (!sets.length) return existing;
    vals.push(id);
    await db.execute(`UPDATE model_content_types SET ${sets.join(",")} WHERE id=$${vals.length}`, ...vals);
    return (await getContentType(id))!;
  });
}

export async function deleteContentType(id: number): Promise<void> {
  return withTransaction(async () => {
    const db = getDb();
    const fields = await db.many("SELECT id FROM model_fields WHERE content_type_id=$1", id);
    for (const f of fields) {
      await db.execute("DELETE FROM model_field_values WHERE field_id=$1", Number(f.id));
    }
    await db.execute("DELETE FROM model_fields WHERE content_type_id=$1", id);
    await db.execute("DELETE FROM model_content_types WHERE id=$1", id);
  });
}

// Re-export parseJson for callers that need it (e.g. config snapshots).
export { parseJson };