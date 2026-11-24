import { ok, auth } from "@/lib/api";
import { unreadCount } from "@/lib/notifications";
import { getSettings } from "@/lib/options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One call the app makes on launch: who am I, what can I do, and the site
// identity needed to render the shell. Keeping this small means the app shows
// its home screen from a single request.
export async function GET() {
    const { user, res } = await auth("subscriber");
    if (res)
        return res;
    const settings = await getSettings();
    return ok({
        user: { id: user!.id, username: user!.username, display_name: user!.display_name, role: user!.role },
        site: { title: settings.site_title, url: settings.site_url, tagline: settings.tagline },
        unread: await unreadCount(user!.id),
        capabilities: {
            publish: ["author", "editor", "administrator"].includes(user!.role),
            moderate: ["editor", "administrator"].includes(user!.role),
            admin: user!.role === "administrator",
        },
    });
}
