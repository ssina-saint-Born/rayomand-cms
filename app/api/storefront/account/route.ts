import { ok, fail, readBody } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/shop/people";
import { customerOrders } from "@/lib/shop/orders";
import { downloadHistory, freeDownloadsForUser } from "@/lib/shop/downloads";
import { getDownloadsSettings, getShopSettings } from "@/lib/shop/core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const user = (await currentUser());
    if (!user)
        return fail("Unauthorized", 401);
    const som = (await getDownloadsSettings());
    const me = { id: user.id, username: user.username, email: user.email, role: user.role };
    return ok({
        user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name },
        profile: (await getCustomerProfile(user.id)),
        orders: (await customerOrders(user.id)),
        freeDownloads: (await getShopSettings()).enable_downloads ? (await freeDownloadsForUser(me)) : [],
        history: som.download_history_enable ? (await downloadHistory(user.id)) : [],
        historyEnabled: !!som.download_history_enable,
        historyTitle: som.download_history_title || "My Free Downloads",
        historyMessage: som.download_history_message || "",
    });
}
export async function PUT(req: Request) {
    const user = (await currentUser());
    if (!user)
        return fail("Unauthorized", 401);
    const body = await readBody(req);
    return ok((await saveCustomerProfile(user.id, body.billing, body.shipping)));
}
