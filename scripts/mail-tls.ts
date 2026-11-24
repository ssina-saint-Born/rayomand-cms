import { loadEnv } from "../lib/env";
import { issueCertificate } from "../lib/mail/engine/acme";
import { getMailSettings } from "../lib/mail/settings";

loadEnv();

// Non-interactive certificate issuance: `npm run mail:tls`.
// All inputs come from the environment so it can run from cron or a deploy
// hook without a prompt.
async function main(): Promise<void> {
    const settings = await getMailSettings();
    const staging = process.env.ACME_STAGING === "1";
    const domains = (process.env.ACME_DOMAINS || settings.mail_hostname || "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

    if (!domains.length) {
        console.error("[tls] Set the mail hostname in Mail settings or pass ACME_DOMAINS.");
        process.exit(1);
    }

    console.log(`[tls] requesting certificate for ${domains.join(", ")}${staging ? " (staging)" : ""}`);
    const result = await issueCertificate({
        domains,
        staging,
        email: process.env.ACME_EMAIL,
        directoryUrl: process.env.ACME_DIRECTORY_URL,
    });
    console.log(`[tls] ${result.ok ? "ok" : "failed"}: ${result.message}`);
    if (result.expires)
        console.log(`[tls] expires ${result.expires}`);
    process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
    console.error("[tls] failed:", error);
    process.exit(1);
});
