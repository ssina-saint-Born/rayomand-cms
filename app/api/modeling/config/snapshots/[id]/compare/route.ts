import { ok, fail, auth } from "@/lib/api";
import { compareSnapshot } from "@/lib/modeling/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const { res } = await auth("administrator");
  if (res) return res;
  try {
    return ok(await compareSnapshot(Number(ctx.params.id)));
  }
  catch (e: any) {
    return fail(e.message);
  }
}