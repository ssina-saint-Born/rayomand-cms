import { ok, fail, readBody, auth } from "@/lib/api";
import { getEntityFieldValues, setEntityFieldValues, flattenFieldValues } from "@/lib/modeling/fieldValues";
import { getContentType } from "@/lib/modeling/contentTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TABLES = new Set(["posts", "products", "media"]);

export async function GET(req: Request) {
  const { res } = await auth("editor");
  if (res) return res;
  const url = new URL(req.url);
  const table = url.searchParams.get("table") || "";
  const entityId = Number(url.searchParams.get("id"));
  const contentTypeId = Number(url.searchParams.get("content_type_id"));
  if (!ALLOWED_TABLES.has(table) || !Number.isInteger(entityId)) return fail("Invalid entity reference.");
  const ct = await getContentType(contentTypeId);
  if (!ct) return fail("Content type not found.", 404);
  return ok(flattenFieldValues(await getEntityFieldValues(table, entityId, contentTypeId)));
}

export async function PUT(req: Request) {
  const { res } = await auth("editor");
  if (res) return res;
  const url = new URL(req.url);
  const table = url.searchParams.get("table") || "";
  const entityId = Number(url.searchParams.get("id"));
  const contentTypeId = Number(url.searchParams.get("content_type_id"));
  if (!ALLOWED_TABLES.has(table) || !Number.isInteger(entityId)) return fail("Invalid entity reference.");
  const ct = await getContentType(contentTypeId);
  if (!ct) return fail("Content type not found.", 404);
  try {
    const values = await setEntityFieldValues(table, entityId, contentTypeId, await readBody(req));
    return ok(flattenFieldValues(values));
  }
  catch (e: any) {
    return fail(e.message);
  }
}