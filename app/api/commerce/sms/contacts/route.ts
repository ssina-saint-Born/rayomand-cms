import { ok, fail, auth, readBody, num } from "@/lib/api";
import { listContacts, deleteContacts, insertContact } from "@/lib/shop/sms-newsletter";
import { contactsCsv } from "@/lib/shop/sms-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    if (p.get("format") === "csv") {
        return new Response(await contactsCsv(), {
            headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"sms-contacts.csv\"" },
        });
    }
    return ok((await listContacts({
        productId: num(p.get("product_id")),
        search: p.get("search") || undefined,
        page: num(p.get("page")),
        perPage: num(p.get("per_page")) || 20,
    })));
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    const saved = await insertContact({ product_id: Number(body.product_id), mobile: String(body.mobile || ""), groups: body.groups });
    if (!saved)
        return fail("A product, mobile number and at least one group are required.");
    return ok({ saved: true }, 201);
}
export async function DELETE(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const ids = String(new URL(req.url).searchParams.get("ids") || "").split(",").map(Number).filter((v) => Number.isFinite(v) && v > 0);
    return ok({ deleted: (await deleteContacts(ids)) });
}
