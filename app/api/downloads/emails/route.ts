import { ok, auth } from "@/lib/api";
import { listEmails } from "@/lib/shop/people";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    return ok({ items: (await listEmails()) });
}
