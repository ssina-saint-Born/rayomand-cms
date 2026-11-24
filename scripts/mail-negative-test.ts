import { loadEnv } from "../lib/env";
import nodemailer from "nodemailer";

loadEnv();

const SMTP_INBOUND = 2525;
const SMTP_SUB = 2587;

function log(step: string, ok: boolean, extra = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${step}${extra ? "  — " + extra : ""}`);
    if (!ok) process.exitCode = 1;
}

async function main() {
    // ── Inbound (port 2525, unauthenticated) delivers to a local mailbox ──
    const inbound = nodemailer.createTransport({ host: "127.0.0.1", port: SMTP_INBOUND, secure: false, ignoreTLS: true });
    try {
        const info = await inbound.sendMail({
            from: "outsider@remote.test",
            to: "probe@example.com",
            subject: "Inbound relay test",
            text: "Delivered from an external sender without authentication.",
        });
        log("Inbound SMTP (port 25 role) accepted for local recipient", /250/.test(info.response), info.response);
    }
    catch (e: any) {
        log("Inbound SMTP accepted for local recipient", false, e.message);
    }

    // ── Inbound must reject a non-existent local recipient ──────────────
    try {
        const info = await inbound.sendMail({ from: "outsider@remote.test", to: "ghost@example.com", subject: "nope", text: "x" });
        log("Inbound rejects unknown mailbox", false, "accepted unexpectedly: " + info.response);
    }
    catch (e: any) {
        log("Inbound rejects unknown mailbox", /550|No mailbox/i.test(e.message), e.message.split("\n")[0]);
    }

    // ── Submission rejects a bad password ───────────────────────────────
    const badAuth = nodemailer.createTransport({
        host: "127.0.0.1", port: SMTP_SUB, secure: false, requireTLS: true,
        tls: { rejectUnauthorized: false }, auth: { user: "probe@example.com", pass: "wrong-password" },
    });
    try {
        await badAuth.sendMail({ from: "probe@example.com", to: "probe@example.com", subject: "x", text: "x" });
        log("Submission rejects bad password", false, "authenticated unexpectedly");
    }
    catch (e: any) {
        log("Submission rejects bad password", /535|Invalid|auth/i.test(e.message), (e.response || e.message).split("\n")[0]);
    }

    // ── Submission blocks sending as a foreign local address ────────────
    const auth = nodemailer.createTransport({
        host: "127.0.0.1", port: SMTP_SUB, secure: false, requireTLS: true,
        tls: { rejectUnauthorized: false }, auth: { user: "probe@example.com", pass: "Probe-Pass-2026" },
    });
    try {
        await auth.sendMail({ from: "ceo@example.com", to: "probe@example.com", subject: "spoof", text: "x" });
        log("Submission blocks sending as another local user", false, "spoof accepted unexpectedly");
    }
    catch (e: any) {
        log("Submission blocks sending as another local user", /553|not allowed/i.test(e.message), (e.response || e.message).split("\n")[0]);
    }

    process.exit(process.exitCode || 0);
}
main().catch((e) => { console.error("ERROR", e); process.exit(1); });
