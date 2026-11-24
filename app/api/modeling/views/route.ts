import { ok, fail, readBody, auth } from "@/lib/api";
import { listViews, createView, validateView } from "@/lib/modeling/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ items: await listViews() });
}

export async function POST(req: Request) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    const body = await readBody(req);
    const check = validateView(body);
    if (!check.ok) return fail(check.message);
    return ok(await createView(body), 201);
  }
  catch (e: any) {
    return fail(e.message);
  }
}