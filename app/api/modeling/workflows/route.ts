import { ok, fail, readBody, auth } from "@/lib/api";
import { listWorkflows, createWorkflow } from "@/lib/modeling/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await listWorkflows());
}

export async function POST(req: Request) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await createWorkflow(await readBody(req)), 201);
  }
  catch (e: any) {
    return fail(e.message);
  }
}