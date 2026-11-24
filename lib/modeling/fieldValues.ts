import { getDb, now, withTransaction } from "../db";
import { parseJson } from "../shop/core";
import { DcField, listFields } from "./fields";
import { isMultipleField, validateFieldValue, toValueObject } from "./fieldTypes";
import { entityTypeForTable, entityExists } from "./entityTypes";

export interface FieldValueItem {
  delta: number;
  value: Record<string, unknown>;
}

// Validate that an entity_reference / media_reference target exists in its
// table before persisting (orphan prevention).
async function assertReferenceTarget(field: DcField, obj: Record<string, unknown>): Promise<void> {
  if (field.field_type !== "entity_reference" && field.field_type !== "media_reference") return;
  const targetTable = field.field_type === "entity_reference"
    ? String((field.settings && (field.settings as any).target) || "posts")
    : "media";
  const targetId = obj.target_id;
  if (targetId == null) return; // optional/empty reference allowed here
  const et = entityTypeForTable(targetTable);
  if (!(await entityExists(et, Number(targetId)))) {
    throw new Error("Referenced item does not exist.");
  }
}

// Field values for an entity, keyed by field machine name. Each entry is the
// list of items (delta-ordered). Mirrors a field item list.
export type EntityFieldValues = Record<string, FieldValueItem[]>;

export async function getEntityFieldValues(
  entityTable: string,
  entityId: number,
  contentTypeId: number,
): Promise<EntityFieldValues> {
  const db = getDb();
  const fields = await listFields(contentTypeId);
  if (!fields.length) return {};
  const rows = await db.many(
    "SELECT v.field_id, v.delta, v.value FROM model_field_values v WHERE v.entity_table=$1 AND v.entity_id=$2 ORDER BY v.delta",
    entityTable, entityId,
  );
  const fieldById = new Map<number, DcField>(fields.map((f) => [f.id, f]));
  const byField = new Map<string, FieldValueItem[]>();
  for (const row of rows) {
    const f = fieldById.get(Number(row.field_id));
    if (!f) continue;
    const list = byField.get(f.machine_name) || [];
    list.push({ delta: Number(row.delta), value: parseJson(row.value, {}) });
    byField.set(f.machine_name, list);
  }
  const out: EntityFieldValues = {};
  for (const f of fields) {
    const list = byField.get(f.machine_name);
    if (list && list.length) out[f.machine_name] = list;
  }
  return out;
}

// Validate an incoming {machineName: value | value[]} payload for a bundle.
// Returns { ok: true } or { ok: false, errors: {machineName: messageKey[]} }.
export function validateFieldValues(fields: DcField[], raw: Record<string, any>): { ok: boolean; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  for (const f of fields) {
    const key = f.machine_name;
    if (!(key in raw)) {
      if (f.required) errors[key] = ["This field is required."];
      continue;
    }
    const value = raw[key];
    if (isMultipleField(f.cardinality)) {
      const items = Array.isArray(value) ? value : [value];
      if (!items.length) {
        if (f.required) errors[key] = ["This field is required."];
        continue;
      }
      const max = f.cardinality > 0 ? f.cardinality : null;
      if (max != null && items.length > max) {
        errors[key] = [`Up to ${max} values are allowed.`];
        continue;
      }
      const listErrors: string[] = [];
      for (const item of items) {
        const main = typeof item === "object" && item !== null && "value" in (item as object) ? (item as any).value : item;
        const err = validateFieldValue(f.field_type, main, f.settings, !!f.required);
        if (err) listErrors.push(err);
      }
      if (listErrors.length) errors[key] = Array.from(new Set(listErrors));
    }
    else {
      const err = validateFieldValue(f.field_type, value, f.settings, !!f.required);
      if (err) errors[key] = [err];
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// Persist field values for an entity. Replaces the field value list entirely
// (native equivalent "set field item list"), in a transaction.
export async function setEntityFieldValues(
  entityTable: string,
  entityId: number,
  contentTypeId: number,
  raw: Record<string, any>,
): Promise<EntityFieldValues> {
  return withTransaction(async () => {
    const db = getDb();
    const fields = await listFields(contentTypeId);
    const check = validateFieldValues(fields, raw);
    if (!check.ok) {
      const first = Object.values(check.errors)[0];
      throw new Error(first ? first[0] : "Invalid field values.");
    }
    const fieldIds = fields.map((f) => f.id);
    if (fieldIds.length) {
      await db.execute(
        "DELETE FROM model_field_values WHERE entity_table=$1 AND entity_id=$2 AND field_id = ANY($3::int[])",
        entityTable, entityId, fieldIds,
      );
    }
    for (const f of fields) {
      if (!(f.machine_name in raw)) continue;
      const value = raw[f.machine_name];
      const items = isMultipleField(f.cardinality) ? (Array.isArray(value) ? value : [value]) : [value];
      let delta = 0;
      for (const item of items) {
        const obj = toValueObject(f.field_type, item);
        await assertReferenceTarget(f, obj);
        await db.execute(
          "INSERT INTO model_field_values (entity_table,entity_type,entity_id,field_id,delta,value,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          entityTable, entityTypeForTable(entityTable).id, entityId, f.id, delta, JSON.stringify(obj), now(),
        );
        delta += 1;
      }
    }
    return (await getEntityFieldValues(entityTable, entityId, contentTypeId));
  });
}

export async function deleteEntityFieldValues(entityTable: string, entityId: number): Promise<void> {
  await getDb().execute("DELETE FROM model_field_values WHERE entity_table=$1 AND entity_id=$2", entityTable, entityId);
}

// Render helpers: produce a plain JS object of scalar values for a bundle's
// fields on an entity (used by public read adapters and Views).
export function flattenFieldValues(values: EntityFieldValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, items] of Object.entries(values)) {
    if (items.length === 1 && !Array.isArray(items[0].value)) {
      const v = items[0].value;
      out[key] = "value" in v ? v.value : v;
    }
    else {
      out[key] = items.map((i) => ("value" in i.value ? i.value.value : i.value));
    }
  }
  return out;
}