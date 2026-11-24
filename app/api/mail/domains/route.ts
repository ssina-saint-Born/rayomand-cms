import { readBody } from "@/lib/api";
import { mailOk, mailFail, requireAdmin, errorMessage } from "@/lib/mail/http";
import { listDomains, addDomain, removeDomain, planForDomain, applyDnsForDomain, domainRecords } from "@/lib/mail/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    return mailOk({ domains: await listDomains() });
}

export async function POST(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    try {
        const domain = await addDomain(String(body.name || ""));
        return mailOk({ domain }, "Domain added.");
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
        return mailFail("Missing domain id.");
    try {
        await removeDomain(id);
        return mailOk(null, "Domain removed.");
    }
    catch (e) {
        return mailFail(errorMessage(e));
    }
}

// PUT runs a DNS action for one domain: "plan" (preview) or "apply".
export async function PUT(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    const id = Number(body.domain_id || 0);
    if (!id)
        return mailFail("Missing domain id.");
    const action = String(body.action || "plan");
    try {
        if (action === "plan") {
            return mailOk({ plan: await planForDomain(id), records: await domainRecords(id) });
        }
        if (action === "apply") {
            const result = await applyDnsForDomain(id, { prune: !!body.prune });
            return mailOk({ result, records: await domainRecords(id) }, `DNS applied: ${result.applied} changed, ${result.skipped} unchanged, ${result.failed.length} failed.`);
        }
        return mailFail("Unknown action.");
    }
    catch (e) {
        return mailFail(errorMessage(e), 502);
    }
}
