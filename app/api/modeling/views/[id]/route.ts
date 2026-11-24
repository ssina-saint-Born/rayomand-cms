import { ok, fail, readBody, auth } from "@/lib/api";
import { getView, updateView, deleteView, validateView } from "@/lib/modeling/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const view = await getView(Number(ctx.params.id));
  if (!view) return fail("View not found.", 404);
  return ok(view);
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    const body = await readBody(req);
    const check = validateView(body);
    if (!check.ok) return fail(check.message);
    return ok(await updateView(Number(ctx.params.id), body));
  }
  catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  await deleteView(Number(ctx.params.id));
  return ok({ deleted: true });
}