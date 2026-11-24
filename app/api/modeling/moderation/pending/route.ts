import { ok, auth } from "@/lib/api";
import { pendingItems } from "@/lib/modeling/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { res } = await auth("editor");
  if (res) return res;
  return ok({ items: await pendingItems() });
}