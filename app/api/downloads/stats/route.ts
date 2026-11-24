import { ok, auth, num } from "@/lib/api";
import { dailySeries, downloadStatsSummary, topDownloads, downloadsCsv } from "@/lib/shop/reports";
import { allDownloads } from "@/lib/shop/downloads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    if (p.get("format") === "csv") {
        return new Response((await downloadsCsv()), {
            headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="free-downloads.csv"' },
        });
    }
    const days = num(p.get("days")) || 30;
    return ok({
        summary: (await downloadStatsSummary(days)),
        series: (await dailySeries(days, "downloads")),
        top: (await topDownloads(8)),
        log: (await allDownloads({ productId: num(p.get("product_id")), page: num(p.get("page")), perPage: 20 })),
    });
}
