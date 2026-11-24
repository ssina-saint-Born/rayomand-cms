import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/mail/http";
import { issueCertificate } from "@/lib/mail/engine/acme";
import { getMailSettings } from "@/lib/mail/settings";
import { invalidateCertificateCache, currentCertificate } from "@/lib/mail/engine/tls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const cert = await currentCertificate();
    return ok({ expires: cert?.expires || null, self_signed: !(await getMailSettings()).tls_cert });
}

export async function POST(req: Request) {
    const denied = await requireAdmin();
    if (denied)
        return denied;
    const body = await req.json().catch(() => ({}));
    const settings = await getMailSettings();
    const domains = Array.isArray(body.domains) && body.domains.length
        ? body.domains.map(String)
        : [settings.mail_hostname].filter(Boolean);
    if (!domains.length)
        return fail("Set the mail hostname first.", 400);

    const result = await issueCertificate({
        domains,
        staging: !!body.staging,
        email: typeof body.email === "string" ? body.email : undefined,
    });
    invalidateCertificateCache();
    return result.ok ? ok(result) : fail(result.message, 502);
}
