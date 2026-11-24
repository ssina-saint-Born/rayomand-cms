import { auth } from "@/lib/api";
import { accessOk } from "@/lib/access/api";
import { collectUsers } from "@/lib/access/export-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const url = new URL(req.url);
    const users = await collectUsers({
        s: url.searchParams.get("s") || undefined,
        role: url.searchParams.get("role") || undefined,
        orderby: url.searchParams.get("orderby") || undefined,
        order: url.searchParams.get("order") || undefined,
    });

    return accessOk(null, { users });
}
