import { ok, fail, readBody, auth, num } from "@/lib/api";
import { deleteShippingClass, listShippingClasses, listZones, saveShippingClass, saveZone, deleteZone } from "@/lib/shop/shipping";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { res } = await auth("administrator");
  if (res) return res;
  const kind = new URL(req.url).searchParams.get("kind") || "zones";
  if (kind === "classes") return ok({ classes: await listShippingClasses() });
  return ok({ zones: await listZones() });
}

export async function POST(req: Request) {
  const { res } = await auth("administrator");
  if (res) return res;
  const body = await readBody(req);
  try {
    if (body.kind === "class") return ok(await saveShippingClass(body), body.id ? 200 : 201);
    return ok(await saveZone(body), body.id ? 200 : 201);
  } catch (e: any) {
    return fail(e.message);
  }
}

export async function DELETE(req: Request) {
  const { res } = await auth("administrator");
  if (res) return res;
  const p = new URL(req.url).searchParams;
  const id = num(p.get("id")) ?? 0;
  try {
    if (p.get("kind") === "class") await deleteShippingClass(id);
    else await deleteZone(id);
    return ok({ deleted: true });
  } catch (e: any) {
    return fail(e.message);
  }
}
