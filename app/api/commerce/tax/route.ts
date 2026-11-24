import { ok, fail, readBody, auth, num } from "@/lib/api";
import { deleteTaxClass, deleteTaxRate, listTaxClasses, listTaxRates, saveTaxClass, saveTaxRate } from "@/lib/shop/tax";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { res } = await auth("administrator");
  if (res) return res;
  const kind = new URL(req.url).searchParams.get("kind") || "rates";
  if (kind === "classes") return ok({ classes: await listTaxClasses() });
  return ok({ rates: await listTaxRates() });
}

export async function POST(req: Request) {
  const { res } = await auth("administrator");
  if (res) return res;
  const body = await readBody(req);
  try {
    if (body.kind === "class") return ok(await saveTaxClass(body), body.id ? 200 : 201);
    return ok(await saveTaxRate(body), body.id ? 200 : 201);
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
    if (p.get("kind") === "class") await deleteTaxClass(id);
    else await deleteTaxRate(id);
    return ok({ deleted: true });
  } catch (e: any) {
    return fail(e.message);
  }
}
