import { loadEnv } from "../lib/env";
import { startMailDaemon } from "../lib/mail/engine/daemon";

loadEnv();

// Standalone entry point: `npm run mail`.
// Runs SMTP (25/587/465), IMAP (143/993), POP3 (110/995) and the outbound
// queue. Ports can be overridden with MAIL_*_PORT for local testing.

async function main(): Promise<void> {
    const handle = await startMailDaemon();
    console.log("[mail] daemon running");
    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping)
            return;
        stopping = true;
        console.log(`[mail] ${signal} received, shutting down`);
        try { await handle.stop(); } catch { /* best effort */ }
        process.exit(0);
    };
    process.on("SIGINT", () => { void shutdown("SIGINT"); });
    process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
}

main().catch((error) => {
    console.error("[mail] failed to start:", error);
    process.exit(1);
});
