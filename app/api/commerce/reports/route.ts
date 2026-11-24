import { ok, auth, num } from "@/lib/api";
import { categorySales, dailySeries, downloadStatsSummary, orderStatusCounts, ordersCsv, salesSummary, topProducts } from "@/lib/shop/reports";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const p = new URL(req.url).searchParams;
    if (p.get("format") === "csv") {
        return new Response((await ordersCsv()), {
            headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="orders.csv"' },
        });
    }
    const days = num(p.get("days")) || 30;
    return ok({
        summary: (await salesSummary(days)),
        downloads: (await downloadStatsSummary(days)),
        series: (await dailySeries(days)),
        top: (await topProducts(7)),
        statuses: (await orderStatusCounts()),
        categories: (await categorySales()),
    });
}
