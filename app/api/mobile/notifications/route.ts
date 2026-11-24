import { ok, fail, readBody, auth } from "@/lib/api";
import { listNotifications, markNotificationsRead, unreadCount } from "@/lib/notifications";
import { touchDevice } from "@/lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Notification feed for the mobile app. Poll `?since=<last_id>` for incremental
// updates; the response always includes the unread count so a badge can update
// without a second request.
export async function GET(req: Request) {
    const { user, res } = await auth("subscriber");
    if (res)
        return res;
    const url = new URL(req.url);
    const since = Number(url.searchParams.get("since") || 0);
    const limit = Number(url.searchParams.get("limit") || 50);
    const deviceId = url.searchParams.get("device_id");
    if (deviceId)
        await touchDevice(user!.id, deviceId);

    const items = await listNotifications({ userId: user!.id, since: since || undefined, limit });
    return ok({ notifications: items, unread: await unreadCount(user!.id) });
}

// Mark one or more notifications read. An empty id list marks all.
export async function POST(req: Request) {
    const { user, res } = await auth("subscriber");
    if (res)
        return res;
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
    const changed = ids.length
        ? await markNotificationsRead(ids, user!.id)
        : await markNotificationsRead((await listNotifications({ userId: user!.id, limit: 200 })).map((n) => n.id), user!.id);
    return ok({ marked: changed, unread: await unreadCount(user!.id) });
}
