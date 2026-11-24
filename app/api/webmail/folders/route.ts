import { fail, ok } from "@/lib/api";
import { requireMailbox } from "@/lib/mail/engine/webmail-session";
import { listFolders, folderStats } from "@/lib/mail/engine/store";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const folders = await listFolders(auth.session.accountId);
    const withCounts = [];
    let usedBytes = 0;
    for (const folder of folders) {
        const stats = await folderStats(auth.session.accountId, folder.id);
        usedBytes += stats.size;
        withCounts.push({
            id: folder.id,
            name: folder.name,
            special_use: folder.special_use,
            unread: stats.unseen,
            total: stats.messages,
        });
    }
    const unused = await getDb().one("SELECT count(*)::int AS n FROM mail_outbox WHERE account_id=$1 AND status='queued'", auth.session.accountId);
    return ok({
        address: auth.session.address,
        display_name: auth.mailbox.display_name,
        quota_mb: Number(auth.mailbox.quota_mb || 0),
        used_bytes: usedBytes,
        queued: Number(unused?.n || 0),
        folders: withCounts,
    });
}
