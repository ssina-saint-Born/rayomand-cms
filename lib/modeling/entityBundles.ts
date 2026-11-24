import { getDb, now, withTransaction } from "../db";
import { getContentType } from "./contentTypes";
import { entityTypeForTable, entityExists, EntityTypeDef } from "./entityTypes";

// Associates a content entity with a bundle (bundle concept). One
// entity belongs to exactly one bundle at a time; reassigning moves it.
// Uses the entity-type registry so posts, products, and media share one path.
const ALLOWED_TABLES = new Set(["posts", "products", "media"]);

function assertTable(entityTable: string): EntityTypeDef {
  if (!ALLOWED_TABLES.has(entityTable)) throw new Error("Unsupported entity table.");
  return entityTypeForTable(entityTable);
}

export async function setEntityBundle(entityTable: string, entityId: number, contentTypeId: number): Promise<void> {
  return withTransaction(async () => {
    const db = getDb();
    const et = assertTable(entityTable);
    if (!Number.isInteger(entityId) || entityId <= 0) throw new Error("Invalid entity id.");
    // Orphan prevention: the referenced entity must exist in its table.
    if (!(await entityExists(et, entityId))) throw new Error("Entity does not exist.");
    const ct = await getContentType(contentTypeId);
    if (!ct) throw new Error("Content type not found.");
    await db.execute(
      "INSERT INTO model_entity_bundles (entity_table,entity_type,entity_id,content_type_id,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (entity_table,entity_id) DO UPDATE SET entity_type=EXCLUDED.entity_type, content_type_id=EXCLUDED.content_type_id",
      entityTable, et.id, entityId, contentTypeId, now(),
    );
  });
}

export async function getEntityBundle(entityTable: string, entityId: number): Promise<number | null> {
  if (!ALLOWED_TABLES.has(entityTable)) return null;
  const row = await getDb().one("SELECT content_type_id FROM model_entity_bundles WHERE entity_table=$1 AND entity_id=$2", entityTable, entityId);
  return row ? Number(row.content_type_id) : null;
}

export async function getBundleRecord(entityTable: string, entityId: number): Promise<{ content_type_id: number; entity_type: string } | null> {
  if (!ALLOWED_TABLES.has(entityTable)) return null;
  const row = await getDb().one("SELECT content_type_id, entity_type FROM model_entity_bundles WHERE entity_table=$1 AND entity_id=$2", entityTable, entityId);
  return row ? { content_type_id: Number(row.content_type_id), entity_type: String(row.entity_type || "") } : null;
}

export async function deleteEntityBundle(entityTable: string, entityId: number): Promise<void> {
  await getDb().execute("DELETE FROM model_entity_bundles WHERE entity_table=$1 AND entity_id=$2", entityTable, entityId);
}