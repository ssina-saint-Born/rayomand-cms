import { ok, fail, readBody, auth } from "@/lib/api";
import { updateState, deleteState } from "@/lib/modeling/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string; sid: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await updateState(Number(params.id), Number(params.sid), await readBody(req)));
  }
  catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; sid: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    await deleteState(Number(params.id), Number(params.sid));
    return ok({ deleted: true });
  }
  catch (e: any) {
    return fail(e.message);
  }
}