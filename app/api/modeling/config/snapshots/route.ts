import { ok, fail, readBody, auth } from "@/lib/api";
import { exportSnapshot, listSnapshots } from "@/lib/modeling/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ items: await listSnapshots() });
}

export async function POST(req: Request) {
  const { res } = await auth("administrator");
  if (res) return res;
  try {
    const body = await readBody(req);
    return ok(await exportSnapshot(String(body.label || "snapshot")), 201);
  }
  catch (e: any) {
    return fail(e.message);
  }
}