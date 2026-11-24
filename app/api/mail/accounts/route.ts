import { readBody } from "@/lib/api";
import { mailOk, mailFail, requireAdmin, errorMessage } from "@/lib/mail/http";
import { listAccounts, addAccount, removeAccount, setAccountSecret, setAccountUser } from "@/lib/mail/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const domainId = Number(new URL(req.url).searchParams.get("domain_id") || 0);
    return mailOk({ accounts: await listAccounts(domainId || undefined) });
}

export async function POST(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    try {
        const account = await addAccount({
            domainId: Number(body.domain_id || 0),
            localPart: String(body.local_part || ""),
            displayName: String(body.display_name || ""),
            secret: String(body.secret || ""),
            quotaMb: Number(body.quota_mb || 0),
            linkedUserId: body.linked_user_id ? Number(body.linked_user_id) : null,
        });
        return mailOk({ account }, "Mailbox created.");
    }
    catch (e) {
        return mailFail(errorMessage(e));
    }
}

export async function DELETE(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id)
        return mailFail("Missing mailbox id.");
    try {
        await removeAccount(id);
        return mailOk(null, "Mailbox removed.");
    }
    catch (e) {
        return mailFail(errorMessage(e));
    }
}

export async function PUT(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    const id = Number(body.id || 0);
    if (!id)
        return mailFail("Missing mailbox id.");
    if (String(body.action || "") !== "password")
        return mailFail("Unknown action.");
    try {
        await setAccountSecret(id, String(body.secret || ""));
        return mailOk(null, "Password updated.");
    }
    catch (e) {
        return mailFail(errorMessage(e));
    }
}

export async function PATCH(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    const id = Number(body.id || 0);
    if (!id)
        return mailFail("Missing mailbox id.");
    if (String(body.action || "") !== "link")
        return mailFail("Unknown action.");
    try {
        const userId = body.user_id ? Number(body.user_id) : null;
        await setAccountUser(id, userId);
        return mailOk(null, userId ? "Mailbox linked to the user; they can now open webmail with their CMS login." : "Mailbox unlinked.");
    }
    catch (e) {
        return mailFail(errorMessage(e));
    }
}
