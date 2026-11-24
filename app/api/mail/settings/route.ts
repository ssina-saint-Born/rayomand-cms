import { readBody } from "@/lib/api";
import { mailOk, mailFail, requireAdmin, errorMessage } from "@/lib/mail/http";
import { getMailSettings, publicSettings, saveMailSettings } from "@/lib/mail/settings";
import { testConnection } from "@/lib/mail/service";
import { providerFor } from "@/lib/mail/dns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const settings = await getMailSettings();
    return mailOk({ settings: publicSettings(settings) });
}

export async function POST(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    try {
        const saved = await saveMailSettings(body);
        return mailOk({ settings: publicSettings(saved) }, "Mail settings saved.");
    }
    catch (e) {
        return mailFail(errorMessage(e));
    }
}

// PUT runs an action: "test_connection" or "test_dns".
export async function PUT(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await readBody(req);
    const action = String(body.action || "");

    if (action === "test_connection") {
        const result = await testConnection();
        return result.ok ? mailOk(result) : mailFail(result.message, 502);
    }

    if (action === "test_dns") {
        const settings = await getMailSettings();
        const provider = providerFor(settings);
        if (!provider)
            return mailFail("Choose a DNS provider and add its API token first.");
        const result = await provider.verify();
        return result.ok ? mailOk(result) : mailFail(result.message, 502);
    }

    return mailFail("Unknown action.");
}
