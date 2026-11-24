import { ok, fail, auth } from "@/lib/api";
import { getSnapshot, deleteSnapshot } from "@/lib/modeling/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const snap = await getSnapshot(Number(ctx.params.id));
  if (!snap) return fail("Snapshot not found.", 404);
  return ok(snap);
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const { res } = await auth("administrator");
  if (res) return res;
  await deleteSnapshot(Number(ctx.params.id));
  return ok({ deleted: true });
}