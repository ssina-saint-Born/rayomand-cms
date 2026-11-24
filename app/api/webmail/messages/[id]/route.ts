import { fail, ok } from "@/lib/api";
import { requireMailbox } from "@/lib/mail/engine/webmail-session";
import { messageById, readRaw, setFlags } from "@/lib/mail/engine/store";
import { parseMessage } from "@/lib/mail/engine/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const id = Number(params.id);
    const message = await messageById(auth.session.accountId, id);
    if (!message)
        return fail("Message not found.", 404);

    const raw = await readRaw(message);
    const parsed = await parseMessage(raw);
    if (!message.seen)
        await setFlags(auth.session.accountId, [id], { seen: true });

    return ok({
        id: message.id,
        subject: message.subject || "(no subject)",
        from: {
            name: parsed.from?.name || parsed.from?.address || "",
            address: parsed.from?.address || "",
        },
        to: parsed.to.map((a) => ({ name: a.name, address: a.address })),
        cc: parsed.cc.map((a) => ({ name: a.name, address: a.address })),
        date: parsed.date.toISOString(),
        message_id: parsed.messageId,
        in_reply_to: parsed.inReplyTo,
        text: parsed.text,
        html: sanitizeHtml(parsed.html),
        attachments: parsed.attachments.map((a, index) => ({
            index,
            filename: a.filename,
            content_type: a.contentType,
            size: a.size,
        })),
        flagged: message.flagged,
        spam_score: message.spam_score,
    });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    if (typeof body.flagged === "boolean")
        await setFlags(auth.session.accountId, [id], { flagged: body.flagged });
    return ok({ ok: true });
}

// Webmail renders third-party HTML, so scripts, frames, forms and inline
// handlers are removed before it reaches the browser. Remote images are kept
// but rewritten to the proxy so the sender cannot track the reader's IP.
function sanitizeHtml(html: string): string {
    if (!html)
        return "";
    let out = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
        .replace(/<object[\s\S]*?<\/object>/gi, "")
        .replace(/<embed[\s\S]*?>/gi, "")
        .replace(/<form[\s\S]*?<\/form>/gi, "")
        .replace(/<meta[^>]*>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
    // Neutralise any URL whose scheme can execute code, in every attribute
    // form (quoted, single-quoted, unquoted, with embedded whitespace/entities).
    out = out.replace(
        /\b(href|src|action|formaction|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        (all, attr: string, _raw: string, dq?: string, sq?: string, bare?: string) => {
            const value = dq ?? sq ?? bare ?? "";
            const normalized = value.replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
            if (/^(javascript|vbscript|data|file):/.test(normalized))
                return `${attr}="#"`;
            return all;
        },
    );
    return out;
}
