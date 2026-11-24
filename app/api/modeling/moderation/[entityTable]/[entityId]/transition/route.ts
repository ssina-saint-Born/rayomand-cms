import { ok, fail, readBody, auth } from "@/lib/api";
import { applyTransition } from "@/lib/modeling/moderation";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: { entityTable: string; entityId: string } }) {
  const { user, res } = await auth("editor");
  if (res) return res;
  try {
    const body = await readBody(req);
    const result = await applyTransition(ctx.params.entityTable, Number(ctx.params.entityId), Number(body.transition_id), user as User);
    return ok(result);
  }
  catch (e: any) {
    return fail(e.message);
  }
}