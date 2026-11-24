import { ok, fail, readBody, auth } from "@/lib/api";
import { getField, updateField, deleteField } from "@/lib/modeling/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const field = await getField(Number(params.id));
  if (!field) return fail("Field not found.", 404);
  return ok(field);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await updateField(Number(params.id), await readBody(req)));
  }
  catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    await deleteField(Number(params.id));
    return ok({ deleted: true, id: Number(params.id) });
  }
  catch (e: any) {
    return fail(e.message);
  }
}