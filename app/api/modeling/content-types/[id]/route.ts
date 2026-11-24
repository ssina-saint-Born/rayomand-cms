import { ok, fail, readBody, auth } from "@/lib/api";
import { getContentType, updateContentType, deleteContentType } from "@/lib/modeling/contentTypes";
import { listFields } from "@/lib/modeling/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ct = await getContentType(Number(params.id));
  if (!ct) return fail("Content type not found.", 404);
  return ok({ ...ct, fields: await listFields(ct.id) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await updateContentType(Number(params.id), await readBody(req)));
  }
  catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    await deleteContentType(Number(params.id));
    return ok({ deleted: true, id: Number(params.id) });
  }
  catch (e: any) {
    return fail(e.message);
  }
}