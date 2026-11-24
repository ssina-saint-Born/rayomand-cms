import { ok, fail, readBody, auth } from "@/lib/api";
import { addState } from "@/lib/modeling/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await addState(Number(params.id), await readBody(req)), 201);
  }
  catch (e: any) {
    return fail(e.message);
  }
}