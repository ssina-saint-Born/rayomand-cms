import { ok, fail } from "@/lib/api";
import { getView, executeView } from "@/lib/modeling/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const view = await getView(Number(ctx.params.id));
  if (!view) return fail("View not found.", 404);
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const exposed: Record<string, unknown> = {};
  for (const [k, v] of Array.from(url.searchParams.entries())) {
    if (k !== "page") exposed[k] = v;
  }
  try {
    return ok(await executeView(view, { page, exposed }));
  }
  catch (e: any) {
    return fail(e.message);
  }
}