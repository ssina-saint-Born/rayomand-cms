import { ok, fail, readBody, auth } from "@/lib/api";
import { updateTransition, deleteTransition } from "@/lib/modeling/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string; tid: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await updateTransition(Number(params.id), Number(params.tid), await readBody(req)));
  }
  catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; tid: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    await deleteTransition(Number(params.id), Number(params.tid));
    return ok({ deleted: true });
  }
  catch (e: any) {
    return fail(e.message);
  }
}