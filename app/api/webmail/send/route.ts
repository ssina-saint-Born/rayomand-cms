import { fail, ok } from "@/lib/api";
import { requireMailbox } from "@/lib/mail/engine/webmail-session";
import { submitOutgoing } from "@/lib/mail/engine/delivery";
import { buildMime } from "@/lib/mail/engine/mime";
import { parseAddressList } from "@/lib/mail/engine/address";
import { domainOf } from "@/lib/mail/engine/address";
import { folderByName, appendMessage } from "@/lib/mail/engine/store";
import { parseMessage } from "@/lib/mail/engine/mime";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);

    const body = await req.json().catch(() => ({}));
    const to = parseAddressList(String(body.to || ""));
    const cc = parseAddressList(String(body.cc || ""));
    const bcc = parseAddressList(String(body.bcc || ""));
    if (!to.length)
        return fail("Add at least one recipient.", 400);

    const from = { name: auth.mailbox.display_name || auth.session.address, address: auth.session.address };
    const subject = String(body.subject || "").slice(0, 998);
    const text = String(body.text || "");
    const html = typeof body.html === "string" && body.html.trim() ? String(body.html) : undefined;
    if (!text.trim() && !html)
        return fail("The message is empty.", 400);

    const raw = buildMime({
        from, to, cc, bcc, subject, text, html,
        inReplyTo: body.in_reply_to ? String(body.in_reply_to) : undefined,
        references: Array.isArray(body.references) ? body.references.map(String) : undefined,
    });

    const domainRow = await getDb().one("SELECT dkim_selector, dkim_private_key FROM mail_domains WHERE name=$1", domainOf(auth.session.address));
    const outcome = await submitOutgoing({
        accountId: auth.session.accountId,
        envelopeFrom: auth.session.address,
        envelopeTo: [...to, ...cc, ...bcc].map((a) => a.address),
        raw,
        signDomain: domainRow && domainRow.dkim_private_key
            ? { domain: domainOf(auth.session.address), selector: String(domainRow.dkim_selector), privateKey: String(domainRow.dkim_private_key) }
            : undefined,
    });

    // A draft that is sent should leave the Drafts folder.
    if (body.draft_id) {
        const drafts = await folderByName(auth.session.accountId, "Drafts");
        if (drafts)
            await getDb().execute("DELETE FROM mail_messages WHERE account_id=$1 AND id=$2", auth.session.accountId, Number(body.draft_id));
    }

    return ok({ ok: true, ...outcome });
}

export async function PUT(req: Request) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const body = await req.json().catch(() => ({}));
    const raw = buildMime({
        from: { name: auth.mailbox.display_name || auth.session.address, address: auth.session.address },
        to: parseAddressList(String(body.to || "")),
        cc: parseAddressList(String(body.cc || "")),
        bcc: parseAddressList(String(body.bcc || "")),
        subject: String(body.subject || ""),
        text: String(body.text || ""),
        html: typeof body.html === "string" && body.html ? String(body.html) : undefined,
    });
    const drafts = await folderByName(auth.session.accountId, "Drafts");
    if (!drafts)
        return fail("Drafts folder is missing.", 500);
    const parsed = await parseMessage(raw).catch(() => null);
    const created = await appendMessage({
        accountId: auth.session.accountId,
        folderId: drafts.id,
        raw,
        flags: { draft: true },
        meta: parsed ? {
            messageId: parsed.messageId, inReplyTo: parsed.inReplyTo, refs: parsed.references.join(" "),
            from: parsed.from, to: parsed.to, cc: parsed.cc, bcc: parsed.bcc, replyTo: parsed.replyTo,
            subject: parsed.subject, sentAt: parsed.date.toISOString(), snippet: parsed.snippet,
            hasAttachments: parsed.attachments.length > 0,
        } : {},
    });
    return ok({ ok: true, id: created.id });
}
