import { fail, ok } from "@/lib/api";
import { requireMailbox } from "@/lib/mail/engine/webmail-session";
import { folderByName, queryMessages, setFlags, moveMessages, type StoredMessage } from "@/lib/mail/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarize(m: StoredMessage) {
    return {
        id: m.id,
        uid: m.uid,
        subject: m.subject || "(no subject)",
        from: m.sender_name || m.sender_addr,
        from_address: m.sender_addr,
        to: m.to_addrs,
        snippet: m.snippet,
        date: m.sent_at,
        seen: m.seen,
        flagged: m.flagged,
        answered: m.answered,
        has_attachments: m.has_attachments,
        size: m.size,
        spam_score: m.spam_score,
    };
}

export async function GET(req: Request) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const url = new URL(req.url);
    const folderName = url.searchParams.get("folder") || "INBOX";
    const folder = await folderByName(auth.session.accountId, folderName);
    if (!folder)
        return fail("Folder not found.", 404);

    const result = await queryMessages(auth.session.accountId, {
        folderId: folder.id,
        search: url.searchParams.get("q") || undefined,
        unseenOnly: url.searchParams.get("unread") === "1",
        flaggedOnly: url.searchParams.get("flagged") === "1",
        limit: Math.min(100, Number(url.searchParams.get("limit") || 50)),
        offset: Math.max(0, Number(url.searchParams.get("offset") || 0)),
    });
    return ok({
        folder: { id: folder.id, name: folder.name },
        total: result.total,
        messages: result.messages.map(summarize),
    });
}

export async function POST(req: Request) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length)
        return fail("No messages selected.", 400);

    switch (action) {
        case "read":
            await setFlags(auth.session.accountId, ids, { seen: true });
            return ok({ ok: true });
        case "unread":
            await setFlags(auth.session.accountId, ids, { seen: false });
            return ok({ ok: true });
        case "flag":
            await setFlags(auth.session.accountId, ids, { flagged: !!body.value });
            return ok({ ok: true });
        case "delete": {
            const trash = await folderByName(auth.session.accountId, "Trash");
            if (trash)
                await moveMessages(auth.session.accountId, ids, trash.id);
            else
                await setFlags(auth.session.accountId, ids, { deleted: true });
            return ok({ ok: true });
        }
        case "move": {
            const target = await folderByName(auth.session.accountId, String(body.folder || ""));
            if (!target)
                return fail("Target folder not found.", 404);
            await moveMessages(auth.session.accountId, ids, target.id);
            return ok({ ok: true });
        }
        default:
            return fail("Unknown action.", 400);
    }
}
