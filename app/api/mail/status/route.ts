import { mailOk, requireAdmin } from "@/lib/mail/http";
import { getMailSettings } from "@/lib/mail/settings";
import { mailStatus, checkPort25 } from "@/lib/mail/service";
import { mailReady } from "@/lib/mail";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const denied = await requireAdmin();
    if (denied)
        return denied;

    const settings = await getMailSettings();
    const counts = await mailStatus();
    const dnsError = Number((await getDb().one("SELECT count(*)::int AS n FROM mail_dns_records WHERE status='error'"))?.n || 0);
    const events = await getDb().many("SELECT category,level,message,detail,created_at FROM mail_events ORDER BY id DESC LIMIT 40");

    return mailOk({
        configured: !!settings.mail_hostname,
        sender_ready: await mailReady(),
        tls_configured: !!settings.tls_cert,
        dns_configured: !!settings.dns_token,
        port25: await checkPort25(),
        counts: { ...counts, dns_error: dnsError },
        hostname: settings.mail_hostname,
        events,
    });
}
