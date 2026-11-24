import { getDb } from "../db";
import type { DcContentType } from "./contentTypes";

// Unified entity-type registry (entity type registry equivalent).
// Each entity type declares its table, id/label/published keys, and capabilities.
// This is what lets one framework serve posts, products, and media despite their
// different schemas and lifecycles.

export type EntityTypeId = "post" | "page" | "product" | "media" | "custom";

export interface EntityTypeDef {
  id: EntityTypeId;
  table: string;
  idKey: string;
  labelKey: string;
  publishedKey: string | null; // null => not publishable (e.g. media)
  revisionable: boolean;
  publishable: boolean;
  // Whether moderation is supported for this type.
  moderateable: boolean;
  description: string;
}

export const ENTITY_TYPES: EntityTypeDef[] = [
  {
    id: "post",
    table: "posts",
    idKey: "id",
    labelKey: "title",
    publishedKey: "status",
    revisionable: true,
    publishable: true,
    moderateable: true,
    description: "classic-style posts",
  },
  {
    id: "page",
    table: "posts",
    idKey: "id",
    labelKey: "title",
    publishedKey: "status",
    revisionable: true,
    publishable: true,
    moderateable: true,
    description: "classic-style pages",
  },
  {
    id: "product",
    table: "products",
    idKey: "id",
    labelKey: "name",
    publishedKey: "status",
    revisionable: false,
    publishable: true,
    moderateable: true, // live-row transitions only (no pending revisions)
    description: "Commerce products",
  },
  {
    id: "media",
    table: "media",
    idKey: "id",
    labelKey: "title",
    publishedKey: null,
    revisionable: false,
    publishable: false,
    moderateable: false,
    description: "CMS media records",
  },
  {
    id: "custom",
    table: "",
    idKey: "id",
    labelKey: "id",
    publishedKey: null,
    revisionable: false,
    publishable: false,
    moderateable: false,
    description: "Custom/generic bundle not yet bound to a table",
  },
];

export function entityTypeDef(id: string): EntityTypeDef {
  return ENTITY_TYPES.find((t) => t.id === id) || ENTITY_TYPES[ENTITY_TYPES.length - 1];
}

export function isKnownEntityType(id: string): boolean {
  return ENTITY_TYPES.some((t) => t.id === id);
}

// Map a table name to its entity type. Used to resolve the adapter for a stored row.
export function entityTypeForTable(table: string): EntityTypeDef {
  return ENTITY_TYPES.find((t) => t.table === table && t.id !== "custom") || entityTypeDef("custom");
}

// Resolve the canonical entity type for a bundle. A bundle carries an entity_type;
// when it is still 'custom'/unset, fall back to the content type's base_type mapping.
export function resolveBundleEntityType(ct: Pick<DcContentType, "entity_type" | "base_type">): EntityTypeDef {
  if (isKnownEntityType(ct.entity_type) && ct.entity_type !== "custom") {
    return entityTypeDef(ct.entity_type);
  }
  const baseToEntity: Record<string, EntityTypeId> = {
    post: "post",
    page: "page",
    custom: "custom",
  };
  const et = baseToEntity[ct.base_type] || "custom";
  return entityTypeDef(et);
}

// Validate that a referenced entity exists in its table (orphan prevention).
export async function entityExists(entityType: EntityTypeDef, id: number): Promise<boolean> {
  if (!entityType.table) return false;
  if (!Number.isInteger(id) || id <= 0) return false;
  const row = await getDb().one(`SELECT ${entityType.idKey} AS k FROM ${entityType.table} WHERE ${entityType.idKey}=$1`, id);
  return !!row;
}