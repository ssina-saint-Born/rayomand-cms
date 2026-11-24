import { ok, fail, readBody, auth } from "@/lib/api";
import { listFields, createField, MODELING_FIELD_TYPES } from "@/lib/modeling/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const contentTypeId = Number(params.id);
  return ok({ items: await listFields(contentTypeId), types: MODELING_FIELD_TYPES });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    const body = await readBody(req);
    const field = await createField({ ...body, content_type_id: Number(params.id) });
    return ok(field, 201);
  }
  catch (e: any) {
    return fail(e.message);
  }
}