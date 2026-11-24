import { mailOk, mailFail, requireAdmin, errorMessage } from "@/lib/mail/http";
import { readBody } from "@/lib/api";
import { ensureSystemMailbox, getSystemSender, mailReady } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prepares the `no-reply@<domain>` mailbox the CMS sends application email
// from. The installer calls this after the operator enters the site domain, and
// Studio → Mail exposes the same action so it can be fixed later.
export async function GET() {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const sender = await getSystemSender();
    return mailOk({ ready: !!sender, address: sender?.address || null, domain: sender?.domain || null });
}

export async function POST(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    const hostname = String(body.hostname || "").trim();
    if (!hostname)
        return mailFail("Enter the site domain (for example example.com).");
    try {
        const sender = await ensureSystemMailbox(hostname);
        return mailOk({ ready: await mailReady(), address: sender.address, domain: sender.domain }, "System mailbox ready. The CMS can now send email.");
    }
    catch (error) {
        return mailFail(errorMessage(error));
    }
}
