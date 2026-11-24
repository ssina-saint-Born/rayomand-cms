import { ok, fail, auth, readBody, num } from "@/lib/api";
import { listArchive, deleteArchiveByPeriod, deleteArchiveRows, archiveCsv } from "@/lib/shop/sms-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    if (p.get("format") === "csv") {
        return new Response(await archiveCsv(), {
            headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"sms-archive.csv\"" },
        });
    }
    return ok((await listArchive({
        search: p.get("search") || undefined,
        type: num(p.get("type")),
        page: num(p.get("page")),
        perPage: num(p.get("per_page")) || 20,
    })));
}
export async function DELETE(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    const ids = p.get("ids");
    if (ids) {
        const list = ids.split(",").map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
        return ok({ deleted: (await deleteArchiveRows(list)) });
    }
    const period = String(p.get("period") || "");
    if (period)
        return ok({ deleted: (await deleteArchiveByPeriod(period)) });
    return fail("Specify ids or a period to delete.");
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    return ok({ deleted: (await deleteArchiveRows(ids)) });
}
