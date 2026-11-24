import { fail } from "@/lib/api";
import { requireMailbox } from "@/lib/mail/engine/webmail-session";
import { messageById, readRaw } from "@/lib/mail/engine/store";
import { parseMessageWithAttachments } from "@/lib/mail/engine/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string; index: string } }) {
    const auth = await requireMailbox();
    if (!auth)
        return fail("Not signed in to webmail.", 401);
    const message = await messageById(auth.session.accountId, Number(params.id));
    if (!message)
        return fail("Message not found.", 404);
    const { attachments } = await parseMessageWithAttachments(await readRaw(message));
    const attachment = attachments[Number(params.index)];
    if (!attachment)
        return fail("Attachment not found.", 404);

    const filename = attachment.filename.replace(/["\r\n]/g, "");
    return new Response(new Uint8Array(attachment.content), {
        headers: {
            "Content-Type": attachment.contentType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(attachment.size),
            "X-Content-Type-Options": "nosniff",
        },
    });
}
