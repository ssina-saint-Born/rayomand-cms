import { ok, fail, readBody, auth } from "@/lib/api";
import { listContentTypes, createContentType } from "@/lib/modeling/contentTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await listContentTypes());
}

export async function POST(req: Request) {
  const { res } = await auth("editor");
  if (res) return res;
  try {
    return ok(await createContentType(await readBody(req)), 201);
  }
  catch (e: any) {
    return fail(e.message);
  }
}