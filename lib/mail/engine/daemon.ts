import { getDb } from "../../db";
import { getMailSettings, logMailEvent } from "../settings";
import { smtpDaemon } from "./smtp-server";
import { ImapServer } from "./imap-server";
import { Pop3Server } from "./pop3-server";
import { processOutbox } from "./delivery";
import { refreshLocalDomainCache } from "./domains";
import { ensureDir, mailDataDir } from "./paths";
import { currentCertificate } from "./tls";

// Mail daemon lifecycle: one process owns SMTP, IMAP, POP3 and the outbound
// queue. It shares the CMS database and nothing else, so it can run beside the
// Next.js server or on its own under systemd.

export interface DaemonHandle {
    stop(): Promise<void>;
}

// Re-issue the certificate once it enters its last 30 days. A self-signed cert
// is never "due", so a server without ACME configured does not spam the log.
async function renewCertificateIfDue(): Promise<void> {
    const settings = await getMailSettings();
    if (!settings.tls_cert || !settings.tls_expires_at)
        return;
    const expires = new Date(settings.tls_expires_at).getTime();
    if (!Number.isFinite(expires) || expires - Date.now() > 30 * 86400_000)
        return;
    const { issueCertificate } = await import("./acme");
    const result = await issueCertificate({ domains: [settings.mail_hostname].filter(Boolean) });
    if (result.ok) {
        const { invalidateCertificateCache } = await import("./tls");
        invalidateCertificateCache();
    }
}

export async function startMailDaemon(): Promise<DaemonHandle> {
    ensureDir(mailDataDir());
    await getDb().one("SELECT 1");
    const settings = await getMailSettings();
    await logMailEvent("daemon", "Mail daemon starting", {
        hostname: settings.mail_hostname || null,
        dataDir: mailDataDir(),
    });

    await refreshLocalDomainCache();
    const cert = await currentCertificate();
    if (cert)
        await logMailEvent("tls", "TLS certificate loaded", { expires: cert.expires });

    const imap = new ImapServer();
    const pop3 = new Pop3Server();
    await smtpDaemon.start();
    await imap.start();
    await pop3.start();

    const outboxTimer = setInterval(() => {
        void processOutbox(20).catch((error) => {
            void logMailEvent("delivery", "Queue pass failed", (error as Error).message, "error");
        });
    }, 30_000);
    // Run one pass immediately so a restart does not wait a full interval.
    void processOutbox(20).catch(() => { /* logged by the timer pass */ });

    const domainTimer = setInterval(() => {
        void refreshLocalDomainCache().catch(() => { /* retried next tick */ });
    }, 60_000);

    // Renew the mail certificate when it is close to expiry. Runs hourly so a
    // daemon left up for months still renews itself.
    const renewTimer = setInterval(() => {
        void renewCertificateIfDue().catch((error) => {
            void logMailEvent("tls", "Renewal check failed", (error as Error).message, "error");
        });
    }, 3600_000);

    return {
        async stop() {
            clearInterval(outboxTimer);
            clearInterval(domainTimer);
            clearInterval(renewTimer);
            await smtpDaemon.stop();
            await imap.stop();
            await pop3.stop();
            await logMailEvent("daemon", "Mail daemon stopped");
        },
    };
}
