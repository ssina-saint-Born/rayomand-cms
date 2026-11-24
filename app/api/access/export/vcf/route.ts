import { auth } from "@/lib/api";
import { collectUsers } from "@/lib/access/export-users";
import { buildVcf } from "@/lib/access/vcf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const url = new URL(req.url);
    const q = url.searchParams;
    const users = await collectUsers({
        s: q.get("s") || undefined,
        role: q.get("role") || undefined,
        orderby: q.get("orderby") || undefined,
        order: q.get("order") || undefined,
    });

    const body = await buildVcf(users, url.origin);
    const filename = `sentinel-exported-users-${new Date().toISOString().slice(0, 10)}.vcf`;

    return new Response(body, {
        headers: {
            "Content-Type": "text/vcard; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
