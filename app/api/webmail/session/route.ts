import { fail, ok, readBody } from "@/lib/api";
import { openWebmailSession, closeWebmailSession, readWebmailSession, cmsUserHasMailbox } from "@/lib/mail/engine/webmail-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const session = await readWebmailSession();
    return ok({
        signed_in: !!session,
        address: session?.address || null,
        via: session?.via || null,
        // The client hides the password prompt when the CMS login already grants
        // mailbox access.
        single_sign_on: await cmsUserHasMailbox(),
    });
}

export async function POST(req: Request) {
    const body = await readBody(req);
    const action = String(body.action || "login");
    if (action === "logout") {
        await closeWebmailSession();
        return ok({ ok: true });
    }
    const username = String(body.address || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password)
        return fail("Enter your address and password.", 400);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const session = await openWebmailSession(username, password, ip);
    if (!session)
        return fail("Invalid address or password.", 401);
    return ok({ ok: true, address: session.address });
}
