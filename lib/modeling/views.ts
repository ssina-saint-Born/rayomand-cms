import { getDb, now } from "../db";
import { parseJson } from "../shop/core";

// Views-style no-code query/display builder (no-code query builder).
// Stores a view definition (base entity, fields, filters, sorts, pager) and
// compiles it into a safe, parameterized SQL descriptor over the entity tables.
// Only known fields and safe operators are allowed; anything else is rejected.

export type ViewBase = "posts" | "products" | "media";

interface FieldSpec { field: string; label?: string; }
interface FilterSpec { field: string; operator: "=" | "!=" | "contains" | ">" | "<" | "in" | "empty"; value?: unknown; }
interface SortSpec { field: string; direction: "asc" | "desc"; }

export interface DcView {
  id: number;
  machine_name: string;
  label: string;
  base: ViewBase;
  display: string;
  fields: FieldSpec[];
  filters: FilterSpec[];
  sorts: SortSpec[];
  pager: { type: string; per_page: number };
  created_at: string;
  updated_at: string;
}

// Allowed base fields per entity type.
const ALLOWED_FIELDS: Record<ViewBase, string[]> = {
  posts: ["id", "title", "slug", "status", "author_id", "created_at", "updated_at", "published_at", "excerpt"],
  products: ["id", "name", "slug", "status", "sku", "price", "regular_price", "sale_price", "created_at", "updated_at", "featured", "stock_status"],
  media: ["id", "filename", "stored_name", "mime", "title", "alt", "caption", "size", "created_at"],
};

const OPERATORS = new Set(["=", "!=", "contains", ">", "<", "in", "empty"]);

function hydrate(row: any): DcView {
  return {
    id: Number(row.id),
    machine_name: String(row.machine_name),
    label: String(row.label),
    base: (row.base as ViewBase) || "posts",
    display: String(row.display || "list"),
    fields: parseJson(row.fields, []),
    filters: parseJson(row.filters, []),
    sorts: parseJson(row.sorts, []),
    pager: parseJson(row.pager, { type: "full", per_page: 10 }),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function validateView(input: Record<string, any>): { ok: true } | { ok: false; message: string } {
  const base = input.base as ViewBase;
  if (!ALLOWED_FIELDS[base]) return { ok: false, message: "Invalid view base." };
  for (const f of (input.fields || [])) {
    if (!ALLOWED_FIELDS[base].includes(f.field)) return { ok: false, message: `Unknown field '${f.field}'.` };
  }
  for (const flt of (input.filters || [])) {
    if (!ALLOWED_FIELDS[base].includes(flt.field)) return { ok: false, message: `Unknown filter field '${flt.field}'.` };
    if (!OPERATORS.has(flt.operator)) return { ok: false, message: `Unsupported operator '${flt.operator}'.` };
  }
  for (const s of (input.sorts || [])) {
    if (!ALLOWED_FIELDS[base].includes(s.field)) return { ok: false, message: `Unknown sort field '${s.field}'.` };
    if (s.direction !== "asc" && s.direction !== "desc") return { ok: false, message: "Sort direction must be asc or desc." };
  }
  return { ok: true };
}

export async function listViews(): Promise<DcView[]> {
  const rows = await getDb().many("SELECT * FROM model_views ORDER BY id DESC");
  return rows.map(hydrate);
}

export async function getView(id: number): Promise<DcView | null> {
  const row = await getDb().one("SELECT * FROM model_views WHERE id=$1", id);
  return row ? hydrate(row) : null;
}

export async function createView(input: Record<string, any>): Promise<DcView> {
  const base = (input.base as ViewBase) || "posts";
  const t = now();
  const r = await getDb().execute(
    "INSERT INTO model_views (machine_name,label,base,display,query,fields,filters,sorts,pager,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
    String(input.machine_name || ""), String(input.label || ""), base, String(input.display || "list"),
    JSON.stringify(input.query || {}), JSON.stringify(input.fields || []), JSON.stringify(input.filters || []),
    JSON.stringify(input.sorts || []), JSON.stringify(input.pager || { type: "full", per_page: 10 }), t, t,
  );
  return (await getView(Number(r.id)))!;
}

export async function updateView(id: number, input: Record<string, any>): Promise<DcView> {
  const existing = await getView(id);
  if (!existing) throw new Error("View not found.");
  const db = getDb();
  const t = now();
  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, v: unknown) => { sets.push(`${col}=$${vals.length + 1}`); vals.push(v); };
  if (input.label !== undefined) push("label", String(input.label));
  if (input.base !== undefined) push("base", String(input.base));
  if (input.display !== undefined) push("display", String(input.display));
  if (input.query !== undefined) push("query", JSON.stringify(input.query));
  if (input.fields !== undefined) push("fields", JSON.stringify(input.fields));
  if (input.filters !== undefined) push("filters", JSON.stringify(input.filters));
  if (input.sorts !== undefined) push("sorts", JSON.stringify(input.sorts));
  if (input.pager !== undefined) push("pager", JSON.stringify(input.pager));
  if (!sets.length) return existing;
  sets.push(`updated_at=$${vals.length + 1}`);
  vals.push(t);
  vals.push(id);
  await db.execute(`UPDATE model_views SET ${sets.join(",")} WHERE id=$${vals.length}`, ...vals);
  return (await getView(id))!;
}

export async function deleteView(id: number): Promise<void> {
  await getDb().execute("DELETE FROM model_views WHERE id=$1", id);
}

// Execute a view: build a safe, parameterized SELECT over the base table.
export async function executeView(view: DcView, opts: { page?: number; exposed?: Record<string, unknown> } = {}): Promise<{ items: Record<string, unknown>[]; total: number; pages: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const fieldList = view.fields.length ? view.fields.map((f) => f.field) : ["*"];
  const cols = fieldList.join(", ");
  for (const flt of view.filters) {
    const value = opts.exposed && opts.exposed[flt.field] !== undefined ? opts.exposed[flt.field] : flt.value;
    if (flt.operator === "empty") {
      where.push(`${flt.field} IS NULL OR ${flt.field} = ''`);
      continue;
    }
    if (value === undefined || value === null) continue;
    const p = params.length + 1;
    switch (flt.operator) {
      case "=": where.push(`${flt.field} = $${p}`); break;
      case "!=": where.push(`${flt.field} != $${p}`); break;
      case "contains": where.push(`${flt.field} LIKE $${p}`); params.push(`%${value}%`); continue;
      case ">": where.push(`${flt.field} > $${p}`); break;
      case "<": where.push(`${flt.field} < $${p}`); break;
      case "in": where.push(`${flt.field} IN ($${p})`); params.push(Array.isArray(value) ? value : [value]); continue;
      default: continue;
    }
    params.push(value);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = view.sorts.length
    ? `ORDER BY ${view.sorts.map((s) => `${s.field} ${s.direction.toUpperCase()}`).join(", ")}`
    : "";
  const total = Number(((await getDb().one(`SELECT COUNT(*) AS c FROM ${view.base} ${whereSql}`, ...params)) as any).c || 0);
  const perPage = Number(view.pager.per_page) || 10;
  const page = Math.max(1, Number(opts.page) || 1);
  const offset = (page - 1) * perPage;
  const rows = await getDb().many(
    `SELECT ${cols} FROM ${view.base} ${whereSql} ${orderSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    ...params, perPage, offset,
  );
  return { items: rows, total, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export { parseJson };