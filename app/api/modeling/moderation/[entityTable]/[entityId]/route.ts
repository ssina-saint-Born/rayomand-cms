import { ok, fail, auth } from "@/lib/api";
import { moderationView } from "@/lib/modeling/moderation";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { entityTable: string; entityId: string } }) {
  const { user, res } = await auth("editor");
  if (res) return res;
  const contentTypeId = null; // moderationView resolves the bundle when null
  const view = await moderationView(ctx.params.entityTable, Number(ctx.params.entityId), contentTypeId, user as User);
  if (!view) return fail("This entity is not moderated.", 404);
  return ok(view);
}