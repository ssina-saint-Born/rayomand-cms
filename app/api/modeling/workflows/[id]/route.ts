import { ok, fail, readBody, auth } from "@/lib/api";
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/modeling/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const wf = await getWorkflow(Number(params.id));
  if (!wf) return fail("Workflow not found.", 404);
  return ok(wf);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await updateWorkflow(Number(params.id), await readBody(req)));
  }
  catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    await deleteWorkflow(Number(params.id));
    return ok({ deleted: true, id: Number(params.id) });
  }
  catch (e: any) {
    return fail(e.message);
  }
}