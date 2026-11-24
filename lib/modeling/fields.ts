import { getDb, now, withTransaction } from "../db";
import { parseJson } from "../shop/core";
import { FIELD_TYPES, fieldTypeDef, isMultipleField } from "./fieldTypes";

export interface DcField {
  id: number;
  content_type_id: number;
  machine_name: string;
  label: string;
  description: string;
  field_type: string;
  cardinality: number;
  required: number;
  settings: Record<string, unknown>;
  position: number;
  created_at: string;
}

function hydrate(row: any): DcField {
  return {
    ...row,
    cardinality: Number(row.cardinality),
    required: Number(row.required),
    settings: parseJson(row.settings, {}),
  };
}

export async function listFields(contentTypeId: number): Promise<DcField[]> {
  const rows = await getDb().many(
    "SELECT * FROM model_fields WHERE content_type_id=$1 ORDER BY position, id",
    contentTypeId,
  );
  return rows.map(hydrate);
}

export async function getField(id: number): Promise<DcField | null> {
  const row = await getDb().one("SELECT * FROM model_fields WHERE id=$1", id);
  return row ? hydrate(row) : null;
}

export function assertMachineName(name: string): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return "Use lowercase letters, numbers and underscores.";
  if (name.length > 64) return "The machine name is too long.";
  return null;
}

export async function createField(input: Record<string, any>): Promise<DcField> {
  return withTransaction(async () => {
    const db = getDb();
    const typeId = Number(input.content_type_id);
    const type = await db.one("SELECT id FROM model_content_types WHERE id=$1", typeId);
    if (!type) throw new Error("Content type not found.");
    const machine = String(input.machine_name || "").trim();
    const err = assertMachineName(machine);
    if (err) throw new Error(err);
    const ft = fieldTypeDef(String(input.field_type || "text"));
    const cardinality = Number(input.cardinality ?? 1);
    if (!isMultipleField(cardinality) && cardinality <= 0) throw new Error("Invalid cardinality.");
    const settings = { ...ft.defaultSettings, ...(input.settings || {}) };
    const position = Number(input.position ?? 0);
    const r = await db.execute(
      "INSERT INTO model_fields (content_type_id,machine_name,label,description,field_type,cardinality,required,settings,position,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      typeId, machine, String(input.label || machine), String(input.description || ""),
      ft.id, cardinality, input.required ? 1 : 0, JSON.stringify(settings), position, now(),
    );
    return (await getField(Number(r.id)))!;
  });
}

export async function updateField(id: number, input: Record<string, any>): Promise<DcField> {
  return withTransaction(async () => {
    const db = getDb();
    const existing = await getField(id);
    if (!existing) throw new Error("Field not found.");
    if (input.machine_name !== undefined && input.machine_name !== existing.machine_name) {
      const err = assertMachineName(String(input.machine_name));
      if (err) throw new Error(err);
    }
    const settings = input.settings !== undefined
      ? { ...fieldTypeDef(existing.field_type).defaultSettings, ...(input.settings || {}) }
      : existing.settings;
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col}=$${vals.length + 1}`); vals.push(v); };
    if (input.label !== undefined) push("label", String(input.label));
    if (input.description !== undefined) push("description", String(input.description));
    if (input.machine_name !== undefined) push("machine_name", String(input.machine_name).trim());
    if (input.cardinality !== undefined) push("cardinality", Number(input.cardinality));
    if (input.required !== undefined) push("required", input.required ? 1 : 0);
    if (input.position !== undefined) push("position", Number(input.position));
    if (input.settings !== undefined) push("settings", JSON.stringify(settings));
    if (!sets.length) return existing;
    vals.push(id);
    await db.execute(`UPDATE model_fields SET ${sets.join(",")} WHERE id=$${vals.length}`, ...vals);
    return (await getField(id))!;
  });
}

export async function deleteField(id: number): Promise<void> {
  return withTransaction(async () => {
    await getDb().execute("DELETE FROM model_field_values WHERE field_id=$1", id);
    await getDb().execute("DELETE FROM model_fields WHERE id=$1", id);
  });
}

export const MODELING_FIELD_TYPES = FIELD_TYPES;